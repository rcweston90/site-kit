import type { Story, StoryMedia } from './types.js';

/** The still or clip a card shows for a story: its list thumbnail, its Work card. */
export interface StoryCardMedia {
  src: string;
  alt: string;
  kind: 'image' | 'video';
  /** A video's still, shown where it can't play. */
  poster?: string;
  /** Width ÷ height, when the media says. */
  aspect?: number;
  /** CSS object-position from the media's framing. */
  objectPosition?: string;
}

const playable = (media: StoryMedia | undefined): media is StoryMedia & { src: string } =>
  Boolean(media?.src?.trim()) && media?.sourceMode !== 'youtube' && media?.sourceMode !== 'pdf' && !media?.animated;

/**
 * A story's card is its hero: the one visual the page leads with. Change the
 * hero and every card follows (the admin's list thumbnail, the home and Work
 * cards), unless the story gives the card media of its own (`workPreview`).
 * The lead is the split graphic when the story leads with one, else the hero,
 * else the first item of its first image group. YouTube, PDF and animated
 * SVG media can't sit in a card, so those fall through to the next visual.
 */
export function storyCardMedia(story: Pick<Story, 'hero' | 'heroGraphic' | 'heroLayout' | 'workPreview' | 'chapters'>): StoryCardMedia | undefined {
  const candidates: (StoryMedia | undefined)[] = [
    story.workPreview,
    story.heroLayout === 'split-graphic' ? story.heroGraphic : undefined,
    story.hero,
    ...(story.chapters ?? []).flatMap((chapter) => chapter.blocks).flatMap((block) => (block.type === 'gallery' ? block.items : [])),
  ];
  const media = candidates.find(playable);
  if (!media) return undefined;
  const framed = media.framing && (media.framing.x !== undefined || media.framing.y !== undefined);
  return {
    src: media.src,
    alt: media.alt,
    kind: media.kind,
    ...(media.poster ? { poster: media.poster } : {}),
    ...(media.aspect ? { aspect: media.aspect } : {}),
    ...(framed ? { objectPosition: `${media.framing?.x ?? 50}% ${media.framing?.y ?? 50}%` } : {}),
  };
}
