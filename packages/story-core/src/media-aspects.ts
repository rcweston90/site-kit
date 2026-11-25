import type { Story } from './types.js';

/*
 * Media shapes measured from the files themselves.
 *
 * A frame takes the shape stored with its media (`aspect`), so it can be
 * drawn before the file arrives. Media saved without a measured shape carries
 * the 16:10 default, and a wrong stored shape crops the file. A renderer
 * corrects the frame once the file loads and records what it measured here;
 * saving a draft writes those shapes in (`withMeasuredAspects`), so readers
 * get the right frame on first paint.
 *
 * The measurements live in this module for the life of the page (a browser
 * tab, usually). On a server, call `forgetMediaAspects` between requests or
 * don't record any.
 */

/** The shape a frame takes when its media has none stored. */
export const DEFAULT_MEDIA_ASPECT = 16 / 10;

/** A stored shape further than this from the file's own is wrong, not rounding. */
const ASPECT_TOLERANCE = 0.01;

const measured = new Map<string, number>();

/** Width / height, to the precision a stored aspect keeps. */
export const mediaAspect = (width: number, height: number): number => Number((width / height).toFixed(4));

export function aspectDiffers(stored: number, actual: number): boolean {
  return Math.abs(actual - stored) / stored > ASPECT_TOLERANCE;
}

/** Records a file's measured shape for the next save. */
export function rememberMediaAspect(src: string, aspect: number): void {
  measured.set(src, aspect);
}

/** Forget every measurement. */
export function forgetMediaAspects(): void {
  measured.clear();
}

const isMedia = (value: Record<string, unknown>) =>
  (value.kind === 'image' || value.kind === 'video') && typeof value.src === 'string';

/**
 * The story with every media object whose file was measured carrying that
 * shape. Animated SVGs keep their authored ratio. Unchanged branches keep
 * their identity, and a story with nothing to correct comes back as is.
 */
export function withMeasuredAspects(story: Story): Story {
  if (measured.size === 0) return story;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const next = value.map(visit);
      return next.some((item, index) => item !== value[index]) ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (isMedia(record) && !record.animated) {
      const actual = measured.get(record.src as string);
      const stored = typeof record.aspect === 'number' ? record.aspect : DEFAULT_MEDIA_ASPECT;
      if (actual && aspectDiffers(stored, actual)) return { ...record, aspect: actual };
      return record;
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      next[key] = visit(child);
      if (next[key] !== child) changed = true;
    }
    return changed ? next : record;
  };
  return visit(story) as Story;
}
