import type { StoryBlock, StoryMedia } from '@rcweston/story-core';

export type EmptyState = { title: string; detail?: string; keepContent?: boolean; action: string; kind?: 'file' | 'link' };

export function emptyMediaState(media: StoryMedia): EmptyState {
  if (media.sourceMode === 'youtube') return {
    title: 'YouTube video not linked',
    detail: media.youtubeUrl?.trim() ? 'Use a link to a YouTube video.' : undefined,
    action: 'Link YouTube video', kind: 'link',
  };
  if (media.sourceMode === 'pdf') return {
    title: 'PDF not linked',
    detail: media.pdfUrl?.trim() ? 'Use a link to a PDF your media route serves.' : undefined,
    action: 'Link PDF', kind: 'link',
  };
  return { title: 'No media yet', action: 'Add media', kind: 'file' };
}

/** Existing editable fields handle their own blank strings. This marks missing
 * collections, not an empty text item, optional field, or layout spacer. */
export function emptyAssetState(block: StoryBlock, inlineSteps: boolean): EmptyState | null {
  switch (block.type) {
    case 'gallery': return block.items.length ? null : { title: 'Gallery is empty', keepContent: Boolean(block.caption?.trim()), action: 'Add gallery images', kind: 'file' };
    case 'custom': return block.component ? null : { title: 'No component chosen', keepContent: Boolean(block.title?.trim() || block.caption?.trim()), action: 'Choose component', kind: 'link' };
    case 'steps': return !block.items.length && !inlineSteps ? { title: 'No steps yet', action: 'Add steps' } : null;
    case 'metrics': return block.items.length ? null : { title: 'No metrics yet', action: 'Add metrics' };
    case 'outcomes': return block.items.length ? null : { title: 'No outcomes yet', action: 'Add outcomes' };
    case 'implemented':
    case 'influenced':
    case 'contribution': return block.items.length ? null : { title: 'No contributions yet', action: 'Add contributions' };
    case 'partners': return block.items.length ? null : { title: 'No partners yet', action: 'Add partners' };
    case 'collaboration': return block.map.groups.length ? null : { title: 'No groups yet', keepContent: true, action: 'Add groups' };
    case 'followUp': return block.items.length ? null : { title: 'No topics yet', keepContent: true, action: 'Add topics' };
    default: return null;
  }
}
