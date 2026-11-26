/**
 * blog's browser-safe half: what a post is, how its versions and
 * publication look on the wire, and the checks a save goes through. The
 * editor screens import this; the stores and handlers live in index.ts.
 *
 * A post keeps every saved version (append-only) and a separate pointer to
 * the one readers see, exactly like a story: Save adds a draft, Publish
 * moves the pointer, Unpublish clears it.
 */

import { safeBlogUrl } from './html.js';

export * from './html.js';

/** What one saved version of a post holds. */
export interface BlogPostContent {
  title: string;
  /** The summary the Posts list shows. */
  description: string;
  tags: string[];
  /** The cover image; empty for none. */
  imageUrl: string;
  /** The body, in the editor's HTML vocabulary (see html.ts). */
  html: string;
}

export type BlogSourceKind = 'editor' | 'seed' | 'restore';

export interface BlogPostDocument {
  id: string;
  /** The version this one was saved over; null for the first. */
  parentDocumentId: string | null;
  sourceKind: BlogSourceKind;
  /** For a restore, the version it brought back. */
  sourceRef: string;
  contentSha256: string;
  content: BlogPostContent;
  createdAt: string;
}

/** A post with its history, as the stores hand it over. */
export interface BlogPostRecord {
  /** Stable across renames; "Learn more" cards point at it. */
  id: number;
  slug: string;
  createdAt: string;
  /** Every saved version, newest first. */
  documents: BlogPostDocument[];
  publishedDocumentId: string | null;
  publishedAt: string | null;
}

/** One row of the admin's Posts list. */
export interface BlogPostSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
  readingTime: string;
  /** Readers can see it. */
  published: boolean;
  /** The newest draft isn't the published version. */
  unpublishedChanges: boolean;
  latestDocumentId: string;
  publishedDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Everything the editor needs to open one post. */
export interface BlogEditorState {
  post: { id: number; slug: string; createdAt: string };
  /** The newest saved version. */
  content: BlogPostContent;
  /** Saved versions, newest first. */
  documents: BlogPostDocument[];
  /** What readers see now, if anything. */
  liveContent: BlogPostContent | null;
  publishedDocumentId: string | null;
}

/** A published post, as public pages read it. `html` is sanitized, with its cards rendered. */
export interface PublicBlogPost {
  id: number;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  image?: string;
  /** ISO date the post is listed under. */
  date: string;
  readingTime: string;
  html: string;
}

export const BLOG_TITLE_MAX = 200;
export const BLOG_DESCRIPTION_MAX = 1000;
export const BLOG_TAG_MAX = 40;
export const BLOG_TAGS_MAX = 20;
export const BLOG_HTML_MAX = 512 * 1024;
/** Body images: the formats the picker offers and the upload limit. */
export const BLOG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const;
export const BLOG_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Addresses the admin's own routes use, so no post can take them. */
export const RESERVED_BLOG_SLUGS = new Set(['new', 'related', 'upload', 'edit']);

export const EMPTY_BLOG_POST: BlogPostContent = { title: '', description: '', tags: [], imageUrl: '', html: '' };

export const BLOG_MESSAGES = {
  needsTitle: 'A post needs a title and an address (slug).',
  slug: 'Use lower-case letters, numbers and single hyphens for the address, like my-first-post.',
  reserved: 'That address is used by the admin. Choose another.',
  taken: 'That address is already used by another post.',
  tooLong: 'This post is too long to save in one piece. Split it into two posts.',
  title: `Keep the title under ${BLOG_TITLE_MAX} characters.`,
  description: `Keep the summary under ${BLOG_DESCRIPTION_MAX} characters.`,
  tags: `Use up to ${BLOG_TAGS_MAX} tags of up to ${BLOG_TAG_MAX} characters each.`,
  image: 'The cover image needs a full https:// address or a path on this site.',
  draftConflict: 'This post has a newer draft. Reload it before saving another version.',
  publishConflict: 'The published version changed after this editor loaded. Reload before publishing again.',
  missingVersion: 'That version of the post isn’t there any more. Reload and try again.',
  notFound: 'There’s no post at this address.',
} as const;

export const isBlogSlug = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** A title turned into an address: "Field notes, week 1" → "field-notes-week-1". */
export function slugifyBlogTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The content a save sends, checked and tidied, or a sentence saying what's wrong. */
export function parseBlogContent(value: unknown): { ok: true; content: BlogPostContent } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: BLOG_MESSAGES.needsTitle };
  const input = value as Record<string, unknown>;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { ok: false, error: BLOG_MESSAGES.needsTitle };
  if (title.length > BLOG_TITLE_MAX) return { ok: false, error: BLOG_MESSAGES.title };
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > BLOG_DESCRIPTION_MAX) return { ok: false, error: BLOG_MESSAGES.description };
  const tagsInput = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(tagsInput) || tagsInput.length > BLOG_TAGS_MAX || !tagsInput.every((tag) => typeof tag === 'string' && tag.trim() && tag.trim().length <= BLOG_TAG_MAX)) {
    return { ok: false, error: BLOG_MESSAGES.tags };
  }
  const tags = [...new Set((tagsInput as string[]).map((tag) => tag.trim()))];
  const rawImage = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  const imageUrl = rawImage ? safeBlogUrl(rawImage, true) : '';
  if (imageUrl === undefined) return { ok: false, error: BLOG_MESSAGES.image };
  const html = typeof input.html === 'string' ? input.html : '';
  if (html.length > BLOG_HTML_MAX) return { ok: false, error: BLOG_MESSAGES.tooLong };
  return { ok: true, content: { title, description, tags, imageUrl, html } };
}

/** "Mar 4, 2026", as the Posts pages print dates (in UTC, so server and browser agree). */
export function formatBlogDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** The routes the blog handlers answer, below the site-data base path. */
export const blogPaths = {
  posts: () => '/blog',
  related: () => '/blog/related',
  upload: () => '/blog/upload',
  post: (slug: string) => `/blog/${encodeURIComponent(slug)}`,
  publish: (slug: string) => `/blog/${encodeURIComponent(slug)}/publish`,
  unpublish: (slug: string) => `/blog/${encodeURIComponent(slug)}/unpublish`,
};

/** A Posts list row brought up to date from the editor state an action answered (reading time kept). */
export function blogSummaryOf(state: BlogEditorState, previous: Pick<BlogPostSummary, 'readingTime'>): BlogPostSummary {
  const latest = state.documents[0];
  return {
    id: state.post.id,
    slug: state.post.slug,
    title: state.content.title,
    description: state.content.description,
    tags: state.content.tags,
    imageUrl: state.content.imageUrl,
    readingTime: previous.readingTime,
    published: state.publishedDocumentId !== null,
    unpublishedChanges: state.publishedDocumentId !== null && state.publishedDocumentId !== latest?.id,
    latestDocumentId: latest?.id ?? '',
    publishedDocumentId: state.publishedDocumentId,
    createdAt: state.post.createdAt,
    updatedAt: latest?.createdAt ?? state.post.createdAt,
  };
}
