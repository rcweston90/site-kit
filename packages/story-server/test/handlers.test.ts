import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocumentStore } from '@rcweston/story-core';
import { createFetchTransport, createStoryHandlers, StoryRequestError } from '../src/index.ts';
import { createMemoryDocumentStore, createMemoryMediaStore, createMemoryTransport, createOpenAuth } from '../src/memory/index.ts';
import { createPasscodeAuth } from '../src/passcode/index.ts';
import { editedStory, sampleStory } from './fixtures.ts';

const rejectsWith = (status: number, code?: string, extra?: (error: StoryRequestError) => void) => (error: unknown) => {
  assert.ok(error instanceof StoryRequestError, `expected a StoryRequestError, got ${error}`);
  assert.equal(error.status, status);
  if (code) assert.equal(error.code, code);
  extra?.(error);
  return true;
};

describe('handlers, end to end through the memory transport', () => {
  it('opens a never-saved story as a blank one', async () => {
    const transport = createMemoryTransport();
    const state = await transport.load('field-notes');
    assert.equal(state.story.slug, 'field-notes');
    assert.equal(state.story.chapters.length, 4);
    assert.deepEqual(state.documents, []);
    assert.equal(state.liveStory, null);
    assert.equal(state.publishedDocumentId, null);
    assert.equal(state.publicationEnabled, true);
    assert.equal(state.renameAvailable, true);
    assert.equal(state.restoresEnabled, true);
    await assert.rejects(transport.load('Not A Slug'), rejectsWith(404, 'NOT_FOUND'));
  });

  it('saves drafts, answers a stale save with a conflict, and lists stories', async () => {
    const transport = createMemoryTransport({ commit: 'build-7' });
    const first = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    assert.equal(first.documents.length, 1);
    assert.equal(first.documents[0].sourceKind, 'editor');
    assert.equal(first.documents[0].sourceCommit, 'build-7');
    assert.deepEqual(first.story, sampleStory('field-notes'));
    assert.ok(first.readinessByDocumentId[first.documents[0].id]);

    const second = await transport.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'two'), parentDocumentId: first.documents[0].id });
    assert.deepEqual(second.documents.map((document) => document.version), [2, 1]);
    await assert.rejects(
      transport.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'late'), parentDocumentId: first.documents[0].id }),
      rejectsWith(409, 'CONFLICT', (error) => assert.match(error.message, /newer draft/)),
    );
    const stories = await transport.list();
    assert.deepEqual(stories.map((story) => [story.slug, story.latestVersion]), [['field-notes', 2]]);
  });

  it('refuses an invalid draft with its problems listed', async () => {
    const transport = createMemoryTransport();
    await assert.rejects(
      transport.saveDraft({ slug: 'field-notes', content: sampleStory('somewhere-else'), parentDocumentId: null }),
      rejectsWith(400, 'INVALID', (error) => assert.ok((error.body.problems ?? []).some((problem) => /slug/.test(problem)))),
    );
    const response = await transport.fetch('/api/story/stories/field-notes/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID');
  });

  it('publishes, refuses a stale publish, and unpublishes', async () => {
    const published: string[] = [];
    const transport = createMemoryTransport({ revalidator: { published: (slug) => void published.push(slug) } });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    const documentId = saved.documents[0].id;
    const live = await transport.publish({ slug: 'field-notes', documentId, expectedPublishedDocumentId: null });
    assert.equal(live.publishedDocumentId, documentId);
    assert.deepEqual(live.liveStory, sampleStory('field-notes'));
    assert.deepEqual(published, ['field-notes']);
    await assert.rejects(transport.publish({ slug: 'field-notes', documentId, expectedPublishedDocumentId: null }), rejectsWith(409, 'CONFLICT'));
    await assert.rejects(
      transport.publish({ slug: 'field-notes', documentId: 'story:field-notes:v5', expectedPublishedDocumentId: documentId }),
      rejectsWith(404, 'NOT_FOUND'),
    );

    const off = await transport.unpublish('field-notes');
    assert.equal(off.publishedDocumentId, null);
    assert.equal(off.liveStory, null);
  });

  it('publishes past notes, and refuses a version that would break the live page', async () => {
    const transport = createMemoryTransport({ customBlocks: ['pricing-table'] });
    const unknown = sampleStory('other-story');
    unknown.chapters[0].blocks.push({ type: 'custom', component: 'mystery-widget' });
    const draft = await transport.saveDraft({ slug: 'other-story', content: unknown, parentDocumentId: null });
    const notes = draft.readinessByDocumentId[draft.documents[0].id];
    assert.ok(notes.warnings.some((issue) => issue.code === 'unknown-custom-block'));
    assert.deepEqual(notes.errors, []);
    const live = await transport.publish({ slug: 'other-story', documentId: draft.documents[0].id, expectedPublishedDocumentId: null });
    assert.equal(live.publishedDocumentId, draft.documents[0].id);

    const broken = sampleStory('field-notes', { hero: { kind: 'image', src: 'ftp://files.example.test/bench.png', alt: 'A workbench' } });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: broken, parentDocumentId: null });
    await assert.rejects(
      transport.publish({ slug: 'field-notes', documentId: saved.documents[0].id, expectedPublishedDocumentId: null }),
      rejectsWith(422, 'INVALID', (error) => assert.ok(error.body.problems?.some((problem) => /path or an HTTP/.test(problem)))),
    );
  });

  it('turns publishing off, and renames with it', async () => {
    const transport = createMemoryTransport({ publicationEnabled: false });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    assert.equal(saved.publicationEnabled, false);
    assert.equal(saved.renameAvailable, false);
    assert.ok(saved.renameUnavailableReason);
    await assert.rejects(transport.publish({ slug: 'field-notes', documentId: saved.documents[0].id, expectedPublishedDocumentId: null }), rejectsWith(503));
    await assert.rejects(transport.unpublish('field-notes'), rejectsWith(503));
    await assert.rejects(transport.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: saved.documents[0].id }), rejectsWith(503));
  });

  it('renames, follows the story from its old address, and checks addresses', async () => {
    const renamed: string[] = [];
    const transport = createMemoryTransport({
      otherAddresses: () => ['about'],
      revalidator: { renamed: (from, to) => void renamed.push(`${from}>${to}`) },
    });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    await transport.publish({ slug: 'field-notes', documentId: saved.documents[0].id, expectedPublishedDocumentId: null });
    await transport.saveDraft({ slug: 'other-story', content: sampleStory('other-story'), parentDocumentId: null });

    const before = await transport.load('field-notes');
    assert.deepEqual(before.takenAddresses, ['about', 'other-story']);
    assert.deepEqual(before.relatedStories, [{ slug: 'other-story', title: sampleStory('other-story').title, company: 'Fieldnote Studio', unpublished: true }]);

    await assert.rejects(transport.rename({ from: 'field-notes', to: 'about', expectedLatestDocumentId: saved.documents[0].id }), rejectsWith(409, 'ADDRESS'));
    await assert.rejects(transport.rename({ from: 'field-notes', to: 'other-story', expectedLatestDocumentId: saved.documents[0].id }), rejectsWith(409, 'ADDRESS'));
    await assert.rejects(transport.rename({ from: 'field-notes', to: 'No Spaces', expectedLatestDocumentId: saved.documents[0].id }), rejectsWith(422, 'ADDRESS'));
    await assert.rejects(transport.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: null }), rejectsWith(409, 'CONFLICT'));

    const state = await transport.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: saved.documents[0].id });
    assert.equal(state.story.slug, 'field-journal');
    assert.equal(state.publishedDocumentId, 'story:field-journal:v1');
    assert.deepEqual(renamed, ['field-notes>field-journal']);
    await assert.rejects(transport.load('field-notes'), rejectsWith(404, 'STORY_MOVED', (error) => assert.equal(error.movedTo, 'field-journal')));
    await assert.rejects(
      transport.saveDraft({ slug: 'field-notes', content: editedStory('field-notes', 'late'), parentDocumentId: saved.documents[0].id }),
      rejectsWith(409, 'STORY_MOVED', (error) => assert.equal(error.movedTo, 'field-journal')),
    );
    // Its old address is its own to take back, and nobody else's.
    const moved = await transport.load('field-journal');
    assert.ok(!moved.takenAddresses.includes('field-notes'));
    assert.ok((await transport.load('other-story')).takenAddresses.includes('field-notes'));
  });

  it('reads published stories for readers, following renames', async () => {
    const store = createMemoryDocumentStore();
    const transport = createMemoryTransport({ store });
    const { handlers } = transport;
    assert.deepEqual(await handlers.getPublishedStory('field-notes'), { status: 'none' });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    assert.deepEqual(await handlers.getPublishedStory('field-notes'), { status: 'none' });
    await transport.publish({ slug: 'field-notes', documentId: saved.documents[0].id, expectedPublishedDocumentId: null });

    const direct = await handlers.getPublishedStory('field-notes');
    assert.equal(direct.status, 'published');
    assert.equal(direct.status === 'published' && direct.redirectFrom, undefined);

    await transport.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: saved.documents[0].id });
    const followed = await handlers.getPublishedStory('field-notes');
    assert.equal(followed.status, 'published');
    if (followed.status === 'published') {
      assert.equal(followed.slug, 'field-journal');
      assert.equal(followed.redirectFrom, 'field-notes');
      assert.equal(followed.story.slug, 'field-journal');
    }
    assert.deepEqual(await handlers.getPublishedStory('../etc'), { status: 'none' });
  });

  it('says "failed" when the published lookup fails, and keeps the editor from loading on a guess', async () => {
    let broken = false;
    const store = createMemoryDocumentStore({ beforeRead: (operation) => { if (broken && operation === 'published') throw new Error('database unreachable'); } });
    const errors: unknown[] = [];
    const transport = createMemoryTransport({ store, onError: (error) => void errors.push(error) });
    const saved = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    await transport.publish({ slug: 'field-notes', documentId: saved.documents[0].id, expectedPublishedDocumentId: null });
    broken = true;
    const lookup = await transport.handlers.getPublishedStory('field-notes');
    assert.equal(lookup.status, 'failed');
    await assert.rejects(transport.load('field-notes'), rejectsWith(500, undefined, (error) => assert.doesNotMatch(error.message, /database/)));
    assert.equal(errors.length, 1);
  });

  it('never fails a save because a revalidation hook did', async () => {
    const errors: unknown[] = [];
    const transport = createMemoryTransport({
      revalidator: { saved: () => { throw new Error('cache offline'); } },
      onError: (error) => void errors.push(error),
    });
    const state = await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    assert.equal(state.documents.length, 1);
    assert.equal(errors.length, 1);
  });

  it('requires a session for every editor route', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: 'a-test-secret-that-is-long-enough-to-sign' });
    const transport = createMemoryTransport({ auth });
    await assert.rejects(transport.load('field-notes'), rejectsWith(401, 'UNAUTHORIZED'));
    await assert.rejects(transport.list(), rejectsWith(401, 'UNAUTHORIZED'));
    await assert.rejects(transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null }), rejectsWith(401));

    const signIn = await transport.fetch('/api/story/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode: 'open sesame' }) });
    assert.equal(signIn.status, 200);
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
    const signedIn = createFetchTransport({ baseUrl: 'http://story.local/api/story', headers: { cookie }, fetch: (url, init) => transport.fetch(url, init) });
    assert.equal((await signedIn.load('field-notes')).story.slug, 'field-notes');
    const checked = await transport.fetch('/api/story/session', { headers: { cookie } });
    assert.deepEqual(await checked.json(), { authenticated: true, role: 'admin' });
    const anonymous = await transport.fetch('/api/story/session');
    assert.deepEqual(await anonymous.json(), { authenticated: false, role: null });
    const signOut = await transport.fetch('/api/story/session', { method: 'DELETE', headers: { cookie } });
    assert.match(signOut.headers.get('set-cookie') ?? '', /Max-Age=0/);
  });

  it('deletes a story and frees its address', async () => {
    const transport = createMemoryTransport();
    await transport.saveDraft({ slug: 'field-notes', content: sampleStory('field-notes'), parentDocumentId: null });
    const removed = await transport.fetch('/api/story/stories/field-notes', { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { deleted: 'field-notes' });
    assert.deepEqual(await transport.list(), []);
    assert.equal((await transport.fetch('/api/story/stories/field-notes', { method: 'DELETE' })).status, 404);
    const crossSite = await transport.fetch('/api/story/stories/field-notes', { method: 'DELETE', headers: { origin: 'https://elsewhere.example' } });
    assert.equal(crossSite.status, 403);
  });

  it('refuses writes from another site', async () => {
    const transport = createMemoryTransport();
    const response = await transport.fetch('/api/story/stories/field-notes/drafts', {
      method: 'POST',
      headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' },
      body: JSON.stringify({ content: sampleStory('field-notes'), parentDocumentId: null }),
    });
    assert.equal(response.status, 403);
    const same = await transport.fetch('/api/story/stories/field-notes/drafts', {
      method: 'POST',
      headers: { origin: 'http://story.local', 'content-type': 'application/json' },
      body: JSON.stringify({ content: sampleStory('field-notes'), parentDocumentId: null }),
    });
    assert.equal(same.status, 201);
  });

  it('routes, refuses wrong methods, and mounts under any base path', async () => {
    const handlers = createStoryHandlers({ store: createMemoryDocumentStore(), media: createMemoryMediaStore(), auth: createOpenAuth(), basePath: '/cms/' });
    const at = (path: string, init?: RequestInit) => handlers.handle(new Request(`http://story.local${path}`, init));
    assert.equal((await at('/cms/stories')).status, 200);
    assert.equal((await at('/cms/nowhere')).status, 404);
    assert.equal((await at('/api/story/stories')).status, 404);
    const wrong = await at('/cms/stories/field-notes/publish');
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'POST');
    // Without a sign-in method on the adapter, there's no session route.
    assert.equal((await at('/cms/session', { method: 'POST' })).status, 404);

    // A named handler can take its slug from the route's own params.
    const load = await handlers.load(new Request('http://story.local/elsewhere'), { slug: 'field-notes' });
    assert.equal(load.status, 200);
    assert.equal(load.headers.get('cache-control'), 'private, no-store');
  });

  it('answers an unexpected failure with a 500 that says nothing internal', async () => {
    const store = createMemoryDocumentStore();
    const failing: DocumentStore = { ...store, list: async () => { throw new Error('connection string leaked here'); } };
    const errors: unknown[] = [];
    const transport = createMemoryTransport({ store: failing, onError: (error) => void errors.push(error) });
    await assert.rejects(transport.list(), rejectsWith(500, undefined, (error) => assert.doesNotMatch(error.message, /leaked/)));
    assert.equal(errors.length, 1);
  });
});

describe('fetch transport', () => {
  it('turns a network failure into a plain message, and passes aborts through', async () => {
    const offline = createFetchTransport({ baseUrl: 'https://cms.example.test/api/story', fetch: async () => { throw new TypeError('fetch failed'); } });
    await assert.rejects(offline.load('field-notes'), rejectsWith(0, undefined, (error) => assert.match(error.message, /Couldn’t reach the server/)));
    const aborting = createFetchTransport({
      baseUrl: 'https://cms.example.test/api/story',
      fetch: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); },
    });
    await assert.rejects(aborting.load('field-notes'), (error: unknown) => (error as Error).name === 'AbortError');
  });

  it('reads a non-JSON error by its status, and refuses a body that is not editor state', async () => {
    const html = createFetchTransport({ baseUrl: '/api/story', fetch: async () => new Response('<html>Bad gateway</html>', { status: 502 }) });
    await assert.rejects(html.load('field-notes'), rejectsWith(502, undefined, (error) => assert.match(error.message, /couldn’t finish/)));
    const expired = createFetchTransport({ baseUrl: '/api/story', fetch: async () => new Response('', { status: 401 }) });
    await assert.rejects(expired.load('field-notes'), rejectsWith(401, 'UNAUTHORIZED'));
    const odd = createFetchTransport({ baseUrl: '/api/story', fetch: async () => Response.json({ hello: 'world' }) });
    await assert.rejects(odd.load('field-notes'), rejectsWith(200));
  });

  it('sends JSON to the routes the handlers serve', async () => {
    const seen: { url: string; method: string; body: unknown }[] = [];
    const transport = createFetchTransport({
      baseUrl: 'https://cms.example.test/api/story/',
      fetch: async (url, init) => {
        seen.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
        return new Response('{"error":"nope"}', { status: 409 });
      },
    });
    await transport.rename({ from: 'field-notes', to: 'field-journal', expectedLatestDocumentId: null }).catch(() => undefined);
    await transport.publish({ slug: 'field-notes', documentId: 'story:field-notes:v1', expectedPublishedDocumentId: null }).catch(() => undefined);
    assert.deepEqual(seen, [
      { url: 'https://cms.example.test/api/story/stories/field-notes/rename', method: 'POST', body: { to: 'field-journal', expectedLatestDocumentId: null } },
      { url: 'https://cms.example.test/api/story/stories/field-notes/publish', method: 'POST', body: { documentId: 'story:field-notes:v1', expectedPublishedDocumentId: null } },
    ]);
  });
});
