import type { StoryChapter } from './types.js';

export type ChapterNavSource = Pick<StoryChapter, 'key' | 'title' | 'hidden'>;

/**
 * A section's name is its authored heading, as plain text, on the chapter
 * rail and everywhere the editor points at a section. Chapter keys stay as
 * anchors, so renaming a heading never breaks a saved/deep link. The markup
 * cleanup is deliberately tolerant of older documents that stored inline
 * emphasis or links even though current chapter titles are plain text.
 */
export function chapterName(title: string): string {
  const plain = title
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/([*_~`])([^\n]*?)\1/g, '$2')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return plain || 'Untitled section';
}

/**
 * The same name cut at a word boundary, for places that put more after it:
 * "The audience was active, but the… · Image 2" keeps the block visible in a
 * menu label or a checklist row.
 */
export function chapterShortName(title: string, max = 40): string {
  const name = chapterName(title);
  if (name.length <= max) return name;
  // `chapterName` collapses whitespace, so the last space is the last word break.
  const space = name.lastIndexOf(' ', max);
  const cut = space > 0 ? name.slice(0, space) : name.slice(0, max);
  return `${cut.replace(/[\s,;:\u2013\u2014-]+$/, '')}…`;
}

export function chapterNavItems(chapters: ChapterNavSource[]) {
  return chapters
    .filter((chapter) => !chapter.hidden)
    .map((chapter) => ({ key: chapter.key, label: chapterName(chapter.title) }));
}
