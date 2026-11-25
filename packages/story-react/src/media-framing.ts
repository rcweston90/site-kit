import type { CSSProperties } from 'react';
import type { StoryMedia } from '@rcweston/story-core';

export const DEFAULT_MEDIA_POSITION = 50;

export function clampMediaPosition(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function mediaFramingStyle(media: StoryMedia): CSSProperties {
  const framing = media.framing;
  return {
    objectFit: framing?.fit ?? 'cover',
    objectPosition: `${clampMediaPosition(framing?.x ?? DEFAULT_MEDIA_POSITION)}% ${clampMediaPosition(framing?.y ?? DEFAULT_MEDIA_POSITION)}%`,
  };
}

/**
 * The same framing for an embed (a YouTube player), which can't take
 * object-fit: the player keeps its source shape and is sized and placed in
 * the box exactly as object-fit and object-position place a file, and the
 * box (overflow hidden) crops it. `sourceAspect` is the player's shape.
 */
export function embedFramingStyle(media: StoryMedia, sourceAspect: number): CSSProperties {
  const framing = media.framing;
  // Above 1 the viewport is wider than the player.
  const ratio = (framing?.aspect ?? sourceAspect) / sourceAspect;
  const cover = (framing?.fit ?? 'cover') === 'cover';
  const width = cover ? Math.max(100, 100 / ratio) : Math.min(100, 100 / ratio);
  const height = cover ? Math.max(100, 100 * ratio) : Math.min(100, 100 * ratio);
  const x = clampMediaPosition(framing?.x ?? DEFAULT_MEDIA_POSITION);
  const y = clampMediaPosition(framing?.y ?? DEFAULT_MEDIA_POSITION);
  const percent = (value: number) => `${Number(value.toFixed(4))}%`;
  return {
    position: 'absolute',
    width: percent(width),
    height: percent(height),
    left: percent(((100 - width) * x) / 100),
    top: percent(((100 - height) * y) / 100),
  };
}

/** True when a crop cuts into the bottom edge or the sides of a player,
 *  where YouTube draws its control bar, so the editor can say so. */
export function embedFramingHidesControls(media: StoryMedia, sourceAspect: number): boolean {
  const style = embedFramingStyle(media, sourceAspect);
  const width = parseFloat(String(style.width));
  const height = parseFloat(String(style.height));
  const y = clampMediaPosition(media.framing?.y ?? DEFAULT_MEDIA_POSITION);
  return width > 100.5 || (height > 100.5 && y < 100);
}

/** Only preview cards magnify (the reader ignores zoom); the document model
 *  accepts 1–3. */
export const MAX_MEDIA_ZOOM = 3;

export function normalizeMediaFraming(framing: StoryMedia['framing']): StoryMedia['framing'] {
  if (!framing) return undefined;
  const zoom = framing.zoom && framing.zoom > 1 ? Math.min(MAX_MEDIA_ZOOM, Number(framing.zoom.toFixed(2))) : undefined;
  const next = {
    aspect: framing.aspect && framing.aspect > 0 ? Number(framing.aspect.toFixed(4)) : undefined,
    fit: framing.fit === 'contain' ? 'contain' as const : undefined,
    x: clampMediaPosition(framing.x ?? DEFAULT_MEDIA_POSITION),
    y: clampMediaPosition(framing.y ?? DEFAULT_MEDIA_POSITION),
    // Only when set, so documents without it keep their exact shape.
    ...(zoom ? { zoom } : {}),
  };
  if (!next.aspect && !next.fit && !zoom && next.x === 50 && next.y === 50) return undefined;
  return next;
}
