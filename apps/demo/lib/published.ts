import { preparePublicStory, type Story, type StoryTeaser } from '@rcweston/story-core';
import { backend } from './story';
import { CUSTOM_BLOCK_NAMES } from '@/content/blocks-registry';

const mediaUrl = (key: string) => `/api/story/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export function forReaders(story: Story): Story {
  return preparePublicStory(story, { mediaUrl, customBlocks: CUSTOM_BLOCK_NAMES });
}

/** Every published story, as teasers for the index and the next-story card. */
export async function publishedTeasers(): Promise<StoryTeaser[]> {
  const { store } = await backend();
  const summaries = await store.list();
  const teasers: StoryTeaser[] = [];
  for (const summary of summaries) {
    if (!summary.publishedDocumentId) continue;
    const lookup = await store.published(summary.slug);
    if (lookup.status !== 'published') continue;
    const story = lookup.document.content;
    teasers.push({ slug: story.slug, title: story.title, company: story.company, summary: story.summary ?? story.thesis });
  }
  return teasers;
}
