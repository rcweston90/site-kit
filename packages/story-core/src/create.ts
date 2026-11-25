import type { Story } from './types.js';
import { STORY_CHAPTERS } from './types.js';
import { storyAddressProblem, suggestStoryAddress } from './rename.js';
import { SLUG_PATTERN } from './internal.js';

export const NEW_STORY_TITLE_MAX = 120;

export interface NewStoryFields {
  title: string;
  slug?: string;
  company?: string;
}

/** The fields a "new story" form posts, checked; null when they're unusable. */
export function newStoryFields(value: unknown): NewStoryFields | null {
  if (!value || typeof value !== 'object') return null;
  const { title, slug, company } = value as Partial<Record<keyof NewStoryFields, unknown>>;
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > NEW_STORY_TITLE_MAX) return null;
  if (slug !== undefined && (typeof slug !== 'string' || !SLUG_PATTERN.test(slug))) return null;
  if (company !== undefined && typeof company !== 'string') return null;
  return {
    title: trimmed,
    ...(slug !== undefined ? { slug: slug as string } : {}),
    ...(company !== undefined ? { company: (company as string).trim() } : {}),
  };
}

/** The address a new story gets from its title, or null when the title
 *  gives none a story can take. */
export function newStorySlug(title: string, reserved?: ReadonlySet<string>): string | null {
  const slug = suggestStoryAddress(title);
  return storyAddressProblem(slug, { current: '', taken: [], reserved }) ? null : slug;
}

/**
 * A blank story: the four STAR sections, each with one empty paragraph to
 * start typing in, and empty thesis and glance. It validates as a draft and
 * publishes as soon as there's something to read.
 */
export function createStory({ title, slug, company = '' }: NewStoryFields, reserved?: ReadonlySet<string>): Story {
  const address = slug ?? newStorySlug(title, reserved);
  if (!address || storyAddressProblem(address, { current: '', taken: [], reserved })) {
    throw new Error('A new story needs a title that makes a usable address.');
  }
  return {
    slug: address,
    company: company.trim(),
    title: title.trim(),
    thesis: '',
    status: 'Draft',
    disclosure: '',
    facts: [],
    glance: { situation: '', task: '', action: '', result: '' },
    glancePresentation: 'clean',
    heroLayout: 'standard',
    chapters: STORY_CHAPTERS.map(({ key, label }) => ({
      key,
      title: label,
      blocks: [{ id: `${address}-${key}-opening`, type: 'prose' as const, paragraphs: [''] }],
    })),
  };
}
