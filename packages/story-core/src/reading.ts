import type { Story } from './types.js';

/*
 * Reading time for a hero ("9 min read"). Counts only words a reader sees:
 * shot briefs, alt text, file paths, enum values and custom block props are
 * skipped. Figures use the common nonfiction pace (about 230 wpm) plus a few
 * seconds per picture, since a story asks you to look as well as read.
 */

export const WORDS_PER_MINUTE = 230;
export const SECONDS_PER_PICTURE = 10;

/** Keys whose string values never render as prose. */
const UNREAD = new Set([
  'alt', 'brief', 'source', 'length', 'draft', 'src', 'poster', 'kind', 'type',
  'key', 'slug', 'companyLogo', 'companyLogoId', 'tone', 'related', 'frame', 'width', 'evidence',
  'status', 'summary', 'presentation', 'layout', 'surface', 'titleWidth', 'size',
  'component', 'props', 'id', 'youtubeUrl', 'pdfUrl', 'href', 'language', 'sourceMode',
]);

function collect(value: unknown, key: string, out: { words: number; pictures: number }) {
  // Custom block props are data for a component, not prose.
  if (key === 'props') return;
  if (typeof value === 'string') {
    if (!UNREAD.has(key)) out.words += value.split(/\s+/).filter(Boolean).length;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, out);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.kind === 'video' || record.kind === 'image') out.pictures += 1;
    for (const [k, v] of Object.entries(record)) collect(v, k, out);
  }
}

/** Words and pictures a reader meets: the same count the read time uses, so
 *  an editor's word count and the hero's minutes agree. The hero is left out. */
export function storyReadingCounts(story: Story): { words: number; pictures: number } {
  const out = { words: 0, pictures: 0 };
  collect({ ...story, hero: undefined }, '', out);
  return out;
}

/** Whole minutes, at least one, or undefined when the story has no chapters. */
export function readingMinutes(story: Story): number | undefined {
  if (story.chapters.length === 0) return undefined;
  const out = storyReadingCounts(story);
  const minutes = out.words / WORDS_PER_MINUTE + (out.pictures * SECONDS_PER_PICTURE) / 60;
  return Math.max(1, Math.round(minutes));
}
