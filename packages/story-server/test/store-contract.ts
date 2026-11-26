/**
 * The DocumentStore contract, as one suite every store must pass. Run by
 * document-store.test.ts against the memory store and the Postgres store.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  AddressTakenError,
  DraftConflictError,
  PublicationConflictError,
  STORY_AUTOSAVE_REF,
  StoryMovedError,
  contentSha256,
  type DocumentStore,
} from '@rcweston/story-core';
import { InvalidStoryError, StoryNotFoundError } from '../src/errors.ts';
import { editedStory, sampleStory } from './fixtures.ts';

export interface StoreHarness {
  /** A fresh, empty store. */
  create(): Promise<DocumentStore>;
  /** Make the store's reads fail from now on (the next `create` is healthy again). */
  breakReads(store: DocumentStore): Promise<void>;
}

const source = { kind: 'test', ref: 'suite', commit: 'abc123' };

export function documentStoreContract(name: string, harness: StoreHarness) {
  describe(`DocumentStore contract: ${name}`, () => {
    let store: DocumentStore;
    beforeEach(async () => {
      store = await harness.create();
    });

    async function saveTwo(slug = 'field-notes') {
      const first = await store.saveDraft({ slug, content: sampleStory(slug), parentDocumentId: null, source });
      const second = await store.saveDraft({ slug, content: editedStory(slug, 'second'), parentDocumentId: first.id, source });
      return { first, second };
    }

    it('saves append-only versions with ids, checksums and parents', async () => {
      const { first, second } = await saveTwo();
      assert.equal(first.id, 'story:field-notes:v1');
      assert.equal(first.version, 1);
      assert.equal(first.parentDocumentId, null);
      assert.equal(first.contentSha256, contentSha256(sampleStory('field-notes')));
      assert.equal(first.sourceKind, 'test');
      assert.equal(first.sourceRef, 'suite');
      assert.equal(first.sourceCommit, 'abc123');
      assert.equal(first.workflowStatus, 'draft');
      assert.equal(first.published, false);
      assert.ok(!Number.isNaN(Date.parse(first.createdAt)));
      assert.equal(second.id, 'story:field-notes:v2');
      assert.equal(second.parentDocumentId, first.id);

      const versions = await store.versions('field-notes');
      assert.deepEqual(versions.map((document) => document.id), [second.id, first.id]);
      assert.deepEqual(versions[1].content, sampleStory('field-notes'));
      assert.equal((await store.latest('field-notes'))?.id, second.id);
      assert.equal((await store.version('field-notes', 1))?.id, first.id);
      assert.equal(await store.version('field-notes', 3), null);
      assert.equal(await store.latest('nothing-here'), null);
      assert.deepEqual(await store.versions('nothing-here'), []);
    });

    it('keeps a saved version unchanged when the caller mutates what it got back', async () => {
      const content = sampleStory('field-notes');
      const saved = await store.saveDraft({ slug: 'field-notes', content, parentDocumentId: null, source });
      content.title = 'Changed after saving';
      saved.content.title = 'Changed on the copy';
      assert.equal((await store.latest('field-notes'))?.content.title, sampleStory('field-notes').title);
    });

    it('folds an autosave into the working autosave, and keeps every other save its own version', async () => {
      const { second } = await saveTwo();
      // The first autosave after an explicit save starts a version of its own.
      const working = await store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'typing'), parentDocumentId: second.id, source, autosave: true });
      assert.equal(working.version, 3);
      assert.equal(working.parentDocumentId, second.id);
      assert.equal(working.sourceKind, 'editor');
      assert.equal(working.sourceRef, STORY_AUTOSAVE_REF);

      // The next one rewrites it: same id and parent, new content and checksum.
      const typed = editedStory('field-notes', 'typing more');
      const folded = await store.saveDraft({ slug: 'field-notes', content: typed, parentDocumentId: working.id, source, autosave: true });
      assert.equal(folded.id, working.id);
      assert.equal(folded.version, 3);
      assert.equal(folded.parentDocumentId, second.id);
      assert.equal(folded.createdAt, working.createdAt);
      assert.ok(Date.parse(folded.updatedAt) >= Date.parse(working.updatedAt));
      assert.equal(folded.contentSha256, contentSha256(typed));
      assert.deepEqual((await store.versions('field-notes')).map((document) => document.version), [3, 2, 1]);
      assert.deepEqual((await store.latest('field-notes'))?.content, typed);
      const [summary] = await store.list();
      assert.equal(summary?.latestDocumentId, working.id);
      assert.equal(summary?.title, typed.title);

      // An explicit save always adds a version, and the next autosave starts another.
      const explicit = await store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'saved'), parentDocumentId: working.id, source });
      assert.equal(explicit.version, 4);
      const after = await store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'after'), parentDocumentId: explicit.id, source, autosave: true });
      assert.equal(after.version, 5);

      // A stale autosave is a conflict, like any save.
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'stale'), parentDocumentId: explicit.id, source, autosave: true }),
        DraftConflictError,
      );
    });

    it('never rewrites a published autosave', async () => {
      const first = await store.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null, source, autosave: true });
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });
      const next = await store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'after publish'), parentDocumentId: first.id, source, autosave: true });
      assert.equal(next.version, 2);
      const published = await store.published('field-notes');
      assert.equal(published.status, 'published');
      assert.deepEqual(published.status === 'published' && published.document.content, sampleStory('field-notes'));
      // Published versions still pass their checksum check when published again.
      await store.publish({ slug: 'field-notes', documentId: next.id, expectedPublishedDocumentId: first.id });
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: next.id });
    });

    it('refuses a draft whose parent is not the latest version', async () => {
      const { first } = await saveTwo();
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'stale'), parentDocumentId: first.id, source }),
        DraftConflictError,
      );
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'fresh'), parentDocumentId: null, source }),
        DraftConflictError,
      );
      await assert.rejects(
        store.saveDraft({ slug: 'other-story', content: sampleStory('other-story'), parentDocumentId: first.id, source }),
        DraftConflictError,
      );
      assert.equal((await store.versions('field-notes')).length, 2);
    });

    it('lets only one of two racing saves from the same parent through', async () => {
      const first = await store.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null, source });
      const results = await Promise.allSettled([
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'a'), parentDocumentId: first.id, source }),
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'b'), parentDocumentId: first.id, source }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof DraftConflictError);
    });

    it('refuses an invalid draft and a slug that disagrees with the address', async () => {
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: { title: 'no shape' } as never, parentDocumentId: null, source }),
        InvalidStoryError,
      );
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: sampleStory('another-address'), parentDocumentId: null, source }),
        InvalidStoryError,
      );
    });

    it('saves a draft with a blank company and thesis', async () => {
      const saved = await store.saveDraft({ slug: 'blank-copy', content: sampleStory('blank-copy', { company: '', thesis: '' }), parentDocumentId: null, source });
      assert.equal(saved.version, 1);
    });

    it('publishes one version as a separate pointer', async () => {
      const { first, second } = await saveTwo();
      assert.deepEqual(await store.published('field-notes'), { status: 'none' });
      const { document, publication } = await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null, publishedBy: 'tester' });
      assert.equal(document.id, first.id);
      assert.equal(document.published, true);
      assert.equal(publication.slug, 'field-notes');
      assert.equal(publication.documentId, first.id);
      assert.equal(publication.publishedBy, 'tester');

      const lookup = await store.published('field-notes');
      assert.equal(lookup.status, 'published');
      assert.equal(lookup.status === 'published' && lookup.document.id, first.id);
      const versions = await store.versions('field-notes');
      assert.deepEqual(versions.map((entry) => entry.published), [false, true]);
      const [summary] = await store.list();
      assert.equal(summary.publishedDocumentId, first.id);
      assert.equal(summary.latestDocumentId, second.id);
      assert.deepEqual((await store.publications()).map((entry) => entry.documentId), [first.id]);

      // Saving a new draft never moves what's published.
      await store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'third'), parentDocumentId: second.id, source });
      const after = await store.published('field-notes');
      assert.equal(after.status === 'published' && after.document.id, first.id);
    });

    it('refuses a stale publish and a version from somewhere else', async () => {
      const { first, second } = await saveTwo();
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });
      await assert.rejects(
        store.publish({ slug: 'field-notes', documentId: second.id, expectedPublishedDocumentId: null }),
        PublicationConflictError,
      );
      await store.publish({ slug: 'field-notes', documentId: second.id, expectedPublishedDocumentId: first.id });
      await assert.rejects(
        store.publish({ slug: 'field-notes', documentId: 'story:field-notes:v9', expectedPublishedDocumentId: second.id }),
        StoryNotFoundError,
      );
      // Publishing what's already published is a no-op, not an error.
      const again = await store.publish({ slug: 'field-notes', documentId: second.id, expectedPublishedDocumentId: second.id });
      assert.equal(again.publication.documentId, second.id);
    });

    it('refuses to publish a version that fails full validation', async () => {
      const draft = await store.saveDraft({ slug: 'unfinished', content: sampleStory('unfinished', { company: '', thesis: '' }), parentDocumentId: null, source });
      await assert.rejects(store.publish({ slug: 'unfinished', documentId: draft.id, expectedPublishedDocumentId: null }), InvalidStoryError);
      assert.deepEqual(await store.published('unfinished'), { status: 'none' });
    });

    it('unpublishes without touching the versions', async () => {
      const { first } = await saveTwo();
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });
      await store.unpublish('field-notes');
      assert.deepEqual(await store.published('field-notes'), { status: 'none' });
      assert.equal((await store.versions('field-notes')).length, 2);
      assert.equal((await store.list())[0].publishedDocumentId, null);
      await store.unpublish('field-notes');
    });

    it('deletes a story with its versions, publication and old addresses, when it can', async () => {
      if (!store.delete) return;
      const { first } = await saveTwo();
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });
      await store.saveDraft({ slug: 'other-notes', content: sampleStory('other-notes'), parentDocumentId: null, source });
      await store.delete('field-notes');
      assert.deepEqual(await store.versions('field-notes'), []);
      assert.deepEqual(await store.published('field-notes'), { status: 'none' });
      assert.deepEqual((await store.list()).map((summary) => summary.slug), ['other-notes']);
      // The address is free again.
      const fresh = await store.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null, source });
      assert.equal(fresh.version, 1);
    });

    it('says "failed" when the lookup fails, never "none"', async () => {
      const { first } = await saveTwo();
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });
      await harness.breakReads(store);
      const lookup = await store.published('field-notes');
      assert.equal(lookup.status, 'failed');
    });

    it('renames: continues the story under the new address, moves the live pointer, and redirects', async () => {
      const { first, second } = await saveTwo();
      await store.publish({ slug: 'field-notes', documentId: first.id, expectedPublishedDocumentId: null });

      const result = await store.rename({
        from: 'field-notes',
        to: 'field-journal',
        expectedLatestDocumentId: second.id,
        source: { kind: 'rename', ref: 'field-notes', commit: 'abc123' },
        publishedBy: 'tester',
      });
      assert.equal(result.from, 'field-notes');
      assert.equal(result.to, 'field-journal');
      // The live version and the newer draft both come along, newest first,
      // so a rename never publishes unpublished edits.
      assert.deepEqual(result.documents.map((document) => document.id), ['story:field-journal:v2', 'story:field-journal:v1']);
      assert.equal(result.publishedDocumentId, 'story:field-journal:v1');
      const [draft, live] = result.documents;
      assert.equal(draft.parentDocumentId, live.id);
      assert.equal(live.parentDocumentId, null);
      assert.equal(draft.content.slug, 'field-journal');
      assert.equal(draft.content.thesis, editedStory('field-notes', 'second').thesis);
      assert.equal(live.content.thesis, sampleStory('field-notes').thesis);
      assert.equal(draft.contentSha256, contentSha256(draft.content));
      assert.equal(draft.sourceKind, 'rename');
      assert.equal(draft.sourceRef, 'field-notes');
      assert.equal(live.published, true);
      assert.equal(draft.published, false);

      const published = await store.published('field-journal');
      assert.equal(published.status === 'published' && published.document.id, 'story:field-journal:v1');
      assert.deepEqual(await store.published('field-notes'), { status: 'none' });
      // Old versions stay where they were saved.
      assert.equal((await store.versions('field-notes')).length, 2);
      assert.deepEqual(await store.redirects(), [{ from: 'field-notes', to: 'field-journal' }]);
      assert.deepEqual(await store.aliases('field-notes'), { movedTo: 'field-journal', formerSlugs: [] });
      assert.deepEqual(await store.aliases('field-journal'), { movedTo: null, formerSlugs: ['field-notes'] });
      assert.deepEqual((await store.list()).map((summary) => summary.slug), ['field-journal']);

      // An editor still open at the old address can't keep saving there.
      await assert.rejects(
        store.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'late'), parentDocumentId: second.id, source }),
        (error: unknown) => error instanceof StoryMovedError && error.movedTo === 'field-journal',
      );
      await assert.rejects(
        store.publish({ slug: 'field-notes', documentId: second.id, expectedPublishedDocumentId: null }),
        StoryMovedError,
      );
      // And the story keeps going at the new one.
      const next = await store.saveDraft({ slug: 'field-journal', content: editedStory('field-journal', 'after'), parentDocumentId: draft.id, source });
      assert.equal(next.version, 3);
    });

    it('renames an unpublished story without publishing it', async () => {
      const { second } = await saveTwo();
      const result = await store.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: second.id, source: { kind: 'rename', ref: 'field-notes' } });
      assert.deepEqual(result.documents.map((document) => document.id), ['story:field-journal:v1']);
      assert.equal(result.publishedDocumentId, null);
      assert.deepEqual(await store.published('field-journal'), { status: 'none' });
    });

    it('refuses a stale rename, a taken address, a bad address and a missing story', async () => {
      const { first, second } = await saveTwo();
      await store.saveDraft({ slug: 'other-story', content: sampleStory('other-story'), parentDocumentId: null, source });
      const rename = (to: string, expected: string | null, from = 'field-notes') =>
        store.rename({ from, to, expectedLatestDocumentId: expected, source: { kind: 'rename', ref: from } });

      await assert.rejects(rename('field-journal', first.id), DraftConflictError);
      await assert.rejects(rename('other-story', second.id), AddressTakenError);
      await assert.rejects(rename('Not An Address', second.id), (error: unknown) => error instanceof Error && !(error instanceof AddressTakenError));
      await assert.rejects(rename('field-notes', second.id), (error: unknown) => error instanceof Error);
      await assert.rejects(rename('anywhere-else', null, 'never-saved'), StoryNotFoundError);
      assert.deepEqual(await store.redirects(), []);
      assert.equal((await store.versions('field-journal')).length, 0);
    });

    it('keeps redirects flat across renames, and lets a story take back an old address', async () => {
      const { second } = await saveTwo();
      const one = await store.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: second.id, source: { kind: 'rename', ref: 'field-notes' } });
      const two = await store.rename({ from: 'field-journal', to: 'field-almanac', expectedLatestDocumentId: one.documents[0].id, source: { kind: 'rename', ref: 'field-journal' } });
      const redirects = await store.redirects();
      assert.deepEqual(
        [...redirects].sort((a, b) => a.from.localeCompare(b.from)),
        [{ from: 'field-journal', to: 'field-almanac' }, { from: 'field-notes', to: 'field-almanac' }],
      );
      assert.deepEqual(await store.aliases('field-almanac'), { movedTo: null, formerSlugs: ['field-journal', 'field-notes'] });
      // A renamed-away address answers moved, even to a rename.
      await assert.rejects(
        store.rename({ from: 'field-journal', to: 'somewhere-new', expectedLatestDocumentId: one.documents[0].id, source: { kind: 'rename', ref: 'field-journal' } }),
        StoryMovedError,
      );

      // Back to the first address: its redirect retires and the old versions there are kept, numbered on.
      const back = await store.rename({ from: 'field-almanac', to: 'field-notes', expectedLatestDocumentId: two.documents[0].id, source: { kind: 'rename', ref: 'field-almanac' } });
      assert.deepEqual(back.documents.map((document) => document.id), ['story:field-notes:v3']);
      assert.deepEqual(await store.aliases('field-notes'), { movedTo: null, formerSlugs: ['field-almanac', 'field-journal'] });
      assert.deepEqual((await store.list()).map((summary) => summary.slug), ['field-notes']);
      assert.equal((await store.versions('field-notes')).length, 3);
    });

    it('lists the latest version of each story by title', async () => {
      await store.saveDraft({ slug: 'zeta-story', content: sampleStory('zeta-story', { title: 'Apples' }), parentDocumentId: null, source });
      await store.saveDraft({ slug: 'alpha-story', content: sampleStory('alpha-story', { title: 'bananas' }), parentDocumentId: null, source });
      const list = await store.list();
      assert.deepEqual(list.map((summary) => summary.slug), ['zeta-story', 'alpha-story']);
      assert.equal(list[0].title, 'Apples');
      assert.equal(list[0].company, 'Fieldnote Studio');
      assert.equal(list[0].latestVersion, 1);
      assert.equal(list[0].latestDocumentId, 'story:zeta-story:v1');
      assert.equal(list[0].publishedDocumentId, null);
    });
  });
}
