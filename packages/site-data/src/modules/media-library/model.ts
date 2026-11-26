/**
 * The image library: every uploaded image, browsable, searchable and ready
 * to reuse in another story. There's no index table; the library lists the
 * MediaStore itself (as the original lists its bucket), and reads which
 * stories use each image from their saved versions. Browser-safe.
 */

export const IMAGE_LIBRARY_PAGE = 24;

/** `story`: one story's folder, with the images it uses first. `all`: every story's. */
export type ImageLibraryScope = 'story' | 'all' | (string & {});

export interface ImageLibraryItem {
  /** The MediaStore key. */
  key: string;
  /** What a media block's `src` gets. */
  src: string;
  /** The file's name. */
  label: string;
  /** The story folder it was uploaded to. */
  source: string;
  /** Who can see it on the site. */
  access: 'public' | 'protected';
  /** Whether it can be put in the story being edited. */
  available: boolean;
  /** Stories whose latest draft or published version shows it (four at most). */
  usedIn: { slug: string; title: string }[];
  size?: number;
  contentType?: string;
}

export interface ImageLibraryPage {
  items: ImageLibraryItem[];
  /** Pass as `after` for the next page, or null at the end. */
  next: string | null;
  /** False when a group scope found no group for the story (nothing to show, and why). */
  assigned: boolean;
}

export interface ImageLibraryQuery {
  scope: ImageLibraryScope;
  /** The story being edited, for `story` scope and for `available`. */
  slug?: string;
  after?: string | null;
  /** Matches the file name, the folder and the titles of stories that use it. */
  search?: string;
}

export const EMPTY_IMAGE_LIBRARY: ImageLibraryPage = { items: [], next: null, assigned: true };

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif)$/i;
export const isImageKey = (key: string) => IMAGE.test(key);

/** The query string the route reads. */
export function imageLibrarySearchParams(query: ImageLibraryQuery): URLSearchParams {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.slug) params.set('slug', query.slug);
  if (query.after) params.set('after', query.after);
  if (query.search?.trim()) params.set('search', query.search.trim());
  return params;
}

/** Every media key a story's content points at, given how keys become `src`s. */
export function storyMediaKeys(story: unknown, keyOf: (src: string) => string | null): Set<string> {
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.kind === 'image' && (!node.sourceMode || node.sourceMode === 'media') && typeof node.src === 'string') {
      const key = keyOf(node.src);
      if (key) keys.add(key);
    }
    Object.values(node).forEach(walk);
  };
  walk(story);
  return keys;
}
