import type { Story, StoryBlock } from '@rcweston/story-core';
import { createEditorItemId } from './model.js';

/*
 * What can be done to a block as a whole — duplicate, delete, copy, cut,
 * paste — as pure story changes. The ⋮⋮ menu and the keyboard shortcuts
 * (⌘D, ⌫, ⌘C, ⌘X, ⌘V on a selected block) both run these, so a menu choice
 * and its shortcut can't drift apart.
 */

export interface StoryBlockChange {
  story: Story;
  /** Selection after the change. */
  select: string;
}

export interface LocatedBlock {
  chapterIndex: number;
  blockIndex: number;
  block: StoryBlock;
  chapterKey: string;
}

export const blockSelectionId = (chapterKey: string, block: StoryBlock, index: number) => `block:${chapterKey}:${block.id ?? String(index)}`;

/** The block a selection id names, or null. */
export function locateBlock(story: Story, selectionId: string): LocatedBlock | null {
  if (!selectionId.startsWith('block:')) return null;
  const [, chapterKey, blockId] = selectionId.split(':');
  const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === chapterKey);
  const blocks = story.chapters[chapterIndex]?.blocks ?? [];
  const blockIndex = blocks.findIndex((block, index) => (block.id ?? String(index)) === blockId);
  return blockIndex >= 0 ? { chapterIndex, blockIndex, block: blocks[blockIndex], chapterKey } : null;
}

const withBlocks = (story: Story, chapterIndex: number, change: (blocks: StoryBlock[]) => StoryBlock[]): Story => ({
  ...story,
  chapters: story.chapters.map((chapter, at) => (at === chapterIndex ? { ...chapter, blocks: change(chapter.blocks) } : chapter)),
});

/** A copy with fresh ids for the block and the rows the editor keys on. */
export function duplicateBlock(block: StoryBlock): StoryBlock {
  const duplicate = { ...structuredClone(block), id: createEditorItemId('block') } as StoryBlock;
  if (duplicate.type === 'outcomes') duplicate.items = duplicate.items.map((item) => ({ ...item, id: createEditorItemId('outcome') }));
  if (duplicate.type === 'followUp') duplicate.items = duplicate.items.map((item) => ({ ...item, id: createEditorItemId('topic') }));
  if (duplicate.type === 'insight') duplicate.columns = duplicate.columns.map((column) => ({ ...column, id: createEditorItemId('column') }));
  return duplicate;
}

/** `block` placed straight after the located one. */
export function insertBlockAfter(story: Story, at: LocatedBlock, block: StoryBlock): StoryBlockChange {
  return {
    story: withBlocks(story, at.chapterIndex, (blocks) => [...blocks.slice(0, at.blockIndex + 1), block, ...blocks.slice(at.blockIndex + 1)]),
    select: blockSelectionId(at.chapterKey, block, at.blockIndex + 1),
  };
}

export const duplicateBlockAt = (story: Story, at: LocatedBlock): StoryBlockChange => insertBlockAfter(story, at, duplicateBlock(at.block));

/** The block gone. The one that slides into its place (or the one above, if
 *  it was last) takes the selection, so the page doesn't jump to the top of
 *  the section. */
export function deleteBlockAt(story: Story, at: LocatedBlock): StoryBlockChange {
  const blocks = story.chapters[at.chapterIndex].blocks;
  const neighbourIndex = blocks[at.blockIndex + 1] ? at.blockIndex + 1 : at.blockIndex - 1;
  const neighbour = blocks[neighbourIndex];
  return {
    story: withBlocks(story, at.chapterIndex, (list) => list.filter((_, index) => index !== at.blockIndex)),
    select: neighbour ? blockSelectionId(at.chapterKey, neighbour, neighbourIndex > at.blockIndex ? at.blockIndex : neighbourIndex) : `chapter:${at.chapterKey}`,
  };
}

/** The block dragged to before or after another, in its section or another
 *  one. Null when it would land where it already is. */
export function moveBlockTo(story: Story, from: LocatedBlock, target: LocatedBlock, placement: 'before' | 'after'): StoryBlockChange | null {
  if (from.block === target.block) return null;
  const removed = withBlocks(story, from.chapterIndex, (blocks) => blocks.filter((_, index) => index !== from.blockIndex));
  const targetIndex = removed.chapters[target.chapterIndex].blocks.indexOf(target.block);
  if (targetIndex < 0) return null;
  const at = placement === 'before' ? targetIndex : targetIndex + 1;
  if (from.chapterIndex === target.chapterIndex && at === from.blockIndex) return null;
  return {
    story: withBlocks(removed, target.chapterIndex, (blocks) => [...blocks.slice(0, at), from.block, ...blocks.slice(at)]),
    select: blockSelectionId(target.chapterKey, from.block, at),
  };
}

/* --- Several blocks ---------------------------------------------------------
 * Shift-click (or ⇧↑ / ⇧↓ on a selected block) selects a run of blocks in one
 * section; the same shortcuts then act on all of them, in order. */

export interface LocatedRange {
  chapterIndex: number;
  chapterKey: string;
  /** First and last index of the run, inclusive. */
  from: number;
  to: number;
  blocks: StoryBlock[];
}

/** The run from `anchor` to `target` when both are blocks of one section,
 *  in reading order whichever was picked first; null otherwise. */
export function locateRange(story: Story, anchor: string, target: string): LocatedRange | null {
  const a = locateBlock(story, anchor);
  const b = locateBlock(story, target);
  if (!a || !b || a.chapterIndex !== b.chapterIndex) return null;
  const from = Math.min(a.blockIndex, b.blockIndex);
  const to = Math.max(a.blockIndex, b.blockIndex);
  return { chapterIndex: a.chapterIndex, chapterKey: a.chapterKey, from, to, blocks: story.chapters[a.chapterIndex].blocks.slice(from, to + 1) };
}

export const rangeSelectionIds = (range: LocatedRange) => range.blocks.map((block, index) => blockSelectionId(range.chapterKey, block, range.from + index));

export function deleteRange(story: Story, range: LocatedRange): StoryBlockChange {
  const blocks = story.chapters[range.chapterIndex].blocks;
  const after = blocks[range.to + 1];
  const before = blocks[range.from - 1];
  return {
    story: withBlocks(story, range.chapterIndex, (list) => list.filter((_, index) => index < range.from || index > range.to)),
    select: after ? blockSelectionId(range.chapterKey, after, range.from) : before ? blockSelectionId(range.chapterKey, before, range.from - 1) : `chapter:${range.chapterKey}`,
  };
}

/** Copies of the run, straight after it; the copies are selected. */
export function duplicateRange(story: Story, range: LocatedRange): StoryBlockChange & { ids: string[] } {
  const copies = range.blocks.map(duplicateBlock);
  const at = range.to + 1;
  return {
    story: withBlocks(story, range.chapterIndex, (blocks) => [...blocks.slice(0, at), ...copies, ...blocks.slice(at)]),
    select: blockSelectionId(range.chapterKey, copies[0], at),
    ids: copies.map((block, index) => blockSelectionId(range.chapterKey, block, at + index)),
  };
}

/** The run one place up or down within its section; null at the edge. */
export function moveRange(story: Story, range: LocatedRange, direction: -1 | 1): StoryBlockChange | null {
  const blocks = story.chapters[range.chapterIndex].blocks;
  const neighbour = direction === -1 ? range.from - 1 : range.to + 1;
  if (neighbour < 0 || neighbour >= blocks.length) return null;
  const next = [...blocks];
  const [moved] = next.splice(neighbour, 1);
  next.splice(direction === -1 ? range.to : range.from, 0, moved);
  return {
    story: withBlocks(story, range.chapterIndex, () => next),
    select: blockSelectionId(range.chapterKey, range.blocks[0], range.from + direction),
  };
}

/* --- Block clipboard ---------------------------------------------------------
 * Copied blocks live for the tab (and survive a reload in sessionStorage), so
 * blocks can move between sections or stories without retyping them. One
 * block or a run, pasted in the order they were copied. */

const CLIPBOARD_KEY = 'story-editor:block-clipboard';
let clipboard: StoryBlock[] | null = null;

export function copyBlocks(blocks: StoryBlock[]): void {
  clipboard = structuredClone(blocks);
  try { window.sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(blocks)); } catch { /* private mode: memory still holds them */ }
}

export const copyBlock = (block: StoryBlock) => copyBlocks([block]);

export function copiedBlocks(): StoryBlock[] | null {
  if (clipboard?.length) return clipboard;
  try {
    const stored = window.sessionStorage.getItem(CLIPBOARD_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    // A single block copied before runs could be: read it as a run of one.
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const blocks = list.filter((block): block is StoryBlock => Boolean(block) && typeof block === 'object' && typeof (block as StoryBlock).type === 'string');
    return blocks.length ? blocks : null;
  } catch {
    return null;
  }
}

/** Kept for the menu's enabled state. */
export const copiedBlock = (): StoryBlock | null => copiedBlocks()?.[0] ?? null;

/** The copied blocks, as new blocks, after the located one. */
export function pasteBlockAfter(story: Story, at: LocatedBlock): StoryBlockChange | null {
  const blocks = copiedBlocks();
  if (!blocks) return null;
  const copies = blocks.map(duplicateBlock);
  const index = at.blockIndex + 1;
  return {
    story: withBlocks(story, at.chapterIndex, (list) => [...list.slice(0, index), ...copies, ...list.slice(index)]),
    select: blockSelectionId(at.chapterKey, copies[0], index),
  };
}
