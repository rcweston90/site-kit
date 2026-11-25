import type { Story } from '@rcweston/story-core';
import { escapeInlineText, HIGHLIGHT_COLORS } from '@rcweston/story-core';

/*
 * Find and replace across a whole story: every word an author typed — hero,
 * sections, blocks, captions, alt text, shot briefs — and none of the
 * settings, ids or addresses beside them. Text inside `paragraphs` is rich
 * text (inline-markup.ts), so a replacement there is escaped and a typed `*`
 * stays a star; plain fields take the replacement as typed.
 */

export interface StoryFindOptions { matchCase: boolean; wholeWord: boolean }
export interface StoryFindMatch { path: (string | number)[]; count: number; text: string }

/** Keys whose values are settings or addresses, not words. */
const NOT_TEXT = new Set([
  'id', 'type', 'kind', 'key', 'slug', 'src', 'poster', 'href', 'youtubeUrl', 'pdfUrl', 'draft', 'source', 'companyLogo', 'companyLogoId',
  'format', 'layout', 'width', 'align', 'frame', 'fit', 'tone', 'presentation', 'surface', 'status', 'evidence', 'icon', 'size',
  'columns', 'titleWidth', 'density', 'sourceMode', 'variant', 'heroLayout', 'heroPresentation', 'glancePresentation', 'related',
]);

/** A highlight's colour (`=={green}`) is markup, not words, so finding
 *  "green" passes over it. Split on this, the odd pieces are colours. */
const HIGHLIGHT_COLOR_TOKEN = new RegExp(`(==\\{(?:${HIGHLIGHT_COLORS.join('|')})\\})`);

export function storyFindPattern(query: string, { matchCase, wholeWord }: StoryFindOptions): RegExp | null {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, `gu${matchCase ? '' : 'i'}`);
}

/** Every field holding the query, in reading order, with its count. */
export function findInStory(story: Story, query: string, options: StoryFindOptions): StoryFindMatch[] {
  const pattern = storyFindPattern(query, options);
  if (!pattern) return [];
  const found: StoryFindMatch[] = [];
  const walk = (value: unknown, path: (string | number)[]) => {
    if (typeof value === 'string') {
      const count = value.split(HIGHLIGHT_COLOR_TOKEN).reduce((sum, piece, index) => (index % 2 ? sum : sum + (piece.match(pattern)?.length ?? 0)), 0);
      if (count) found.push({ path, count, text: value });
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index]));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) if (!NOT_TEXT.has(key)) walk(item, [...path, key]);
    }
  };
  walk(story, []);
  return found;
}

/** The story with every match replaced, and how many were. */
export function replaceInStory(story: Story, query: string, replacement: string, options: StoryFindOptions): { story: Story; replaced: number } {
  const pattern = storyFindPattern(query, options);
  if (!pattern) return { story, replaced: 0 };
  let replaced = 0;
  const visit = (value: unknown, rich: boolean): unknown => {
    if (typeof value === 'string') {
      return value.split(HIGHLIGHT_COLOR_TOKEN).map((piece, index) => (index % 2 ? piece
        : piece.replace(pattern, () => { replaced += 1; return rich ? escapeInlineText(replacement) : replacement; }))).join('');
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, rich));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, NOT_TEXT.has(key) ? item : visit(item, key === 'paragraphs')]));
    }
    return value;
  };
  const next = visit(story, false) as Story;
  return { story: replaced ? next : story, replaced };
}
