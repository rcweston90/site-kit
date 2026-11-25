import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePublication, validateStory, validateStoryDraft } from '@rcweston/story-core';
import { createMemoryTransport } from '@rcweston/story-server/memory';
import { seed } from '../content/seed.ts';
import { CUSTOM_BLOCK_NAMES } from '../content/blocks-registry.ts';

describe('demo seed', () => {
  it('publishes stories that validate and are ready to publish', () => {
    const knownSlugs = [...seed.published, ...seed.drafts].map((story) => story.slug);
    for (const story of seed.published) {
      assert.deepEqual(validateStory(story), [], story.slug);
      const readiness = validatePublication(story, { knownSlugs, customBlocks: CUSTOM_BLOCK_NAMES });
      assert.deepEqual(readiness.errors, [], story.slug);
      assert.deepEqual(readiness.warnings.filter((issue) => issue.code === 'unknown-custom-block'), [], story.slug);
    }
    for (const story of seed.drafts) assert.deepEqual(validateStoryDraft(story), [], story.slug);
  });

  it('runs end to end on the in-memory backend: save, conflict, publish, rename', async () => {
    const transport = createMemoryTransport({ customBlocks: CUSTOM_BLOCK_NAMES });
    const [first] = seed.published;
    const saved = await transport.saveDraft({ slug: first.slug, content: first, parentDocumentId: null });
    const documentId = saved.documents[0].id;

    await assert.rejects(transport.saveDraft({ slug: first.slug, content: first, parentDocumentId: null }), /newer draft/);

    const published = await transport.publish({ slug: first.slug, documentId, expectedPublishedDocumentId: null });
    assert.equal(published.publishedDocumentId, documentId);

    const renamed = await transport.rename({ from: first.slug, to: 'weekly-decision', expectedLatestDocumentId: documentId });
    assert.equal(renamed.story.slug, 'weekly-decision');
    const story = await transport.handlers.getPublishedStory(first.slug);
    assert.equal(story.status, 'published');
    if (story.status === 'published') assert.equal(story.slug, 'weekly-decision');
  });
});
