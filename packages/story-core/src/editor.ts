import type { Story, StoryBlock } from './types.js';

/*
 * Path updates for an editor: every change is a new story value, the old one
 * untouched, so undo is a stack of values and a save is a value. The React
 * editor contract that uses these (StoryRenderEditor) lives in story-react.
 */

export type StoryFieldPath = readonly (string | number)[];

/** Where a draft's text belongs in a story that may have changed since the
 *  edit began, or null when that place is gone. */
export type StoryDraftPath = (story: Story) => StoryFieldPath | null;

/** The story with one block replaced. An index that isn't there leaves it as is. */
export function updateStoryBlock(story: Story, chapterIndex: number, blockIndex: number, block: StoryBlock): Story {
  const chapter = story.chapters[chapterIndex];
  if (!chapter || !chapter.blocks[blockIndex]) return story;
  const chapters = [...story.chapters];
  const blocks = [...chapter.blocks];
  blocks[blockIndex] = block;
  chapters[chapterIndex] = { ...chapter, blocks };
  return { ...story, chapters };
}

/** A stable string for a path, for keys and maps: `chapters.0.blocks.2.text`. */
export function storyFieldKey(path: StoryFieldPath): string {
  return path.map(String).join('.');
}

/** The story with one field set. Array steps that are out of range, and steps
 *  through a non-object, leave the story as it was. */
export function updateStoryField(story: Story, path: StoryFieldPath, value: string | number): Story {
  return updateStoryFieldValue(story, path, value);
}

/** The same path mechanics on any value, such as a nested media item. */
export function updateStoryFieldValue<T>(root: T, path: StoryFieldPath, value: string | number): T {
  if (path.length === 0) return root;

  const update = (current: unknown, at: number): unknown => {
    const key = path[at];
    const leaf = at === path.length - 1;
    if (Array.isArray(current)) {
      const next = [...current];
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= next.length) return current;
      next[index] = leaf ? value : update(next[index], at + 1);
      return next;
    }
    if (!current || typeof current !== 'object' || typeof key !== 'string') return current;
    // Never write through keys an object inherits.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return current;
    const record = current as Record<string, unknown>;
    return { ...record, [key]: leaf ? value : update(record[key], at + 1) };
  };

  return update(root, 0) as T;
}

/** Visibility switches default to on: only an explicit false hides. */
export function isStoryVisible(value: boolean | undefined): boolean {
  return value !== false;
}
