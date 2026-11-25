import type { Story, StoryBlock } from './types.js';
import { isRecord, type Fields } from './internal.js';

/*
 * Earlier versions of the model had three blocks for several images: a media
 * pair, a before/after comparison and a gallery. They are one image group now
 * (a `gallery` with a layout). Stored documents are never rewritten, so every
 * read upgrades older pairs and comparisons here and the next save writes the
 * group.
 *
 * What a reader saw is kept: a pair was two images side by side; a
 * comparison printed its label ("Before" / "After" / "Third" when blank)
 * above each image, which is now that image's own heading.
 */

const COMPARE_SIDES = [
  { media: 'before', label: 'beforeLabel', fallback: 'Before' },
  { media: 'after', label: 'afterLabel', fallback: 'After' },
  { media: 'third', label: 'thirdLabel', fallback: 'Third' },
] as const;

function headed(media: unknown, label: unknown, fallback: string): unknown {
  if (!isRecord(media)) return media;
  const text = typeof label === 'string' && label.trim() ? label : fallback;
  const own = typeof media.heading === 'string' && media.heading.trim() ? media.heading : '';
  return { ...media, heading: own ? `${text} · ${own}` : text };
}

/** The group a stored pair or comparison is now; any other block as it is.
 *  Takes unknown input so the validator can upgrade before it checks. */
export function upgradeLegacyMediaBlock(block: unknown): unknown {
  if (!isRecord(block)) return block;
  if (block.type === 'pair') return { ...block, type: 'gallery', layout: 'horizontal' };
  if (block.type === 'compare') {
    const group: Fields = { ...block, type: 'gallery', layout: block.layout ?? 'horizontal' };
    group.items = COMPARE_SIDES
      .filter((side) => side.media !== 'third' || block.third !== undefined)
      .map((side) => headed(block[side.media], block[side.label], side.fallback));
    for (const side of COMPARE_SIDES) {
      delete group[side.media];
      delete group[side.label];
    }
    return group;
  }
  return block;
}

const isLegacy = (block: unknown) => isRecord(block) && (block.type === 'pair' || block.type === 'compare');

/** The story with every stored pair and comparison as an image group. The
 *  same object comes back when there is nothing to upgrade. */
export function upgradeStoryMediaGroups(story: Story): Story {
  if (!story.chapters?.some((chapter) => chapter.blocks?.some(isLegacy))) return story;
  return {
    ...story,
    chapters: story.chapters.map((chapter) => chapter.blocks.some(isLegacy)
      ? { ...chapter, blocks: chapter.blocks.map((block) => upgradeLegacyMediaBlock(block) as StoryBlock) }
      : chapter),
  };
}
