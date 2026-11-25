import type { StoryMedia } from './types.js';
import { normalizeMediaSource } from './media-source.js';
import { youTubeThumbnail } from './youtube.js';
import { DEFAULT_MEDIA_ASPECT } from './media-aspects.js';

export type StoryMediaSource = NonNullable<StoryMedia['sourceMode']>;

/** The media settings and reader behaviour a source may not be able to
 *  offer. Everything else (heading, caption, link, alt text, mat or edge to
 *  edge, padding, colour, size, production notes) is shared by every source
 *  by construction: it sits outside any per-source branch. */
export type StoryMediaFeature = 'upload' | 'framing' | 'poster' | 'playback' | 'enlarge';

/**
 * Feature parity between media sources. Every source answers every feature:
 * `true`, or the reason it can't have it. A new feature or a new source
 * doesn't type-check until each pair is decided, and settings panels and
 * readers ask this table, never the source type, whether to offer one.
 * Within a file source, poster and playback are for video and enlarge is for
 * stills.
 */
export const MEDIA_SOURCE_FEATURES = {
  media: { upload: true, framing: true, poster: true, playback: true, enlarge: true },
  youtube: {
    upload: 'A YouTube video is linked, not uploaded.',
    framing: true,
    poster: true,
    playback: 'A YouTube video plays with sound, and only when a reader clicks its still, so there is no silent loop.',
    enlarge: 'The player’s own full-screen button does it.',
  },
  pdf: {
    upload: 'Uploads take images and video; a PDF is linked from your media route.',
    framing: 'A document is read whole, so its viewer is never cropped; its box shape is the aspect ratio under Size.',
    poster: 'A document has no poster frame.',
    playback: 'A document doesn’t play.',
    enlarge: 'The browser’s viewer has its own zoom and full screen.',
  },
} as const satisfies Record<StoryMediaSource, Record<StoryMediaFeature, true | string>>;

export function mediaSource(media: StoryMedia): StoryMediaSource {
  return media.sourceMode ?? 'media';
}

export function mediaSupports(media: StoryMedia, feature: StoryMediaFeature): boolean {
  return MEDIA_SOURCE_FEATURES[mediaSource(media)][feature] === true;
}

/** What the media is, for labels. An embed keeps the `kind` of the file it
 *  set aside (an image, usually), so its source says what it is now. */
export function mediaNoun(media: StoryMedia): 'image' | 'video' | 'document' {
  const source = mediaSource(media);
  return source === 'youtube' ? 'video' : source === 'pdf' ? 'document' : media.kind;
}

/** An editor's label for media, by its active source, not a retained file
 *  kind (switching sources keeps the old file for later). */
export function mediaEditorLabel(media: StoryMedia): 'Media' | 'Image' | 'Video' | 'YouTube' | 'PDF' {
  const source = mediaSource(media);
  if (source === 'youtube') return 'YouTube';
  if (source === 'pdf') return 'PDF';
  if (!media.src?.trim()) return 'Media';
  return media.kind === 'video' ? 'Video' : 'Image';
}

/** The shape the media has before any framing: the stored one, else the
 *  source's usual one. */
export function mediaSourceAspect(media: StoryMedia): number {
  if (media.aspect) return media.aspect;
  const source = mediaSource(media);
  if (source === 'youtube') return 16 / 9;
  if (source === 'pdf') return 4 / 3;
  return DEFAULT_MEDIA_ASPECT;
}

/** What a YouTube video shows until a reader clicks it: its poster, else
 *  YouTube's own still. Null for any other source. */
export function youTubeStill(media: StoryMedia): string | null {
  if (mediaSource(media) !== 'youtube') return null;
  return normalizeMediaSource(media.poster) ?? youTubeThumbnail(media.youtubeUrl);
}
