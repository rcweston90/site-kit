import { storyCardMedia, type Story, type StoryCardMedia } from '@rcweston/story-core';

/** `{ cover }` for a summary when the story has something a card can show. */
export function withCover(content: Partial<Story> | null | undefined): { cover?: StoryCardMedia } {
  if (!content || typeof content !== 'object') return {};
  try {
    const cover = storyCardMedia({ ...content, chapters: Array.isArray(content.chapters) ? content.chapters : [] });
    return cover ? { cover } : {};
  } catch {
    return {};
  }
}
