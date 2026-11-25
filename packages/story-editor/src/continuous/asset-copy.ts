import type { Story, StoryBlock } from '@rcweston/story-core';
import type { StoryFieldPath } from '@rcweston/story-core';

export interface InlineAssetTarget {
  block: StoryBlock;
  chapterKey: string;
  blockIndex: number;
}

export function hasInlineAssetCopy(block: StoryBlock) {
  return block.type === 'metrics' || block.type === 'outcomes' || block.type === 'steps';
}

/** Saved text targets a persistent ID, not whichever node now occupies its
 * old index. Legacy ID-less assets are only editable at their unchanged slot. */
export function inlineAssetPath(story: Story, target: InlineAssetTarget): StoryFieldPath | null {
  if (!target.block.id) {
    const chapter = story.chapters.findIndex(item => item.key === target.chapterKey);
    const current = story.chapters[chapter]?.blocks[target.blockIndex];
    return current && !current.id && JSON.stringify(current) === JSON.stringify(target.block)
      ? ['chapters', chapter, 'blocks', target.blockIndex] : null;
  }
  let match: StoryFieldPath | null = null;
  for (const [chapterIndex, chapter] of story.chapters.entries()) {
    for (const [blockIndex, block] of chapter.blocks.entries()) {
      if (block.id !== target.block.id) continue;
      if (match || block.type !== target.block.type) return null;
      match = ['chapters', chapterIndex, 'blocks', blockIndex];
    }
  }
  return match;
}
