/**
 * The handlers' routes, relative to where you mount them. Shared by the
 * server and the fetch client so the two can't drift apart. Browser-safe.
 */

export const DEFAULT_BASE_PATH = '/api/story';

export type StoryRoute =
  | { name: 'list' }
  | { name: 'load'; slug: string }
  | { name: 'saveDraft'; slug: string }
  | { name: 'publish'; slug: string }
  | { name: 'unpublish'; slug: string }
  | { name: 'rename'; slug: string }
  | { name: 'uploadMedia' }
  | { name: 'serveMedia'; key: string[] }
  | { name: 'session' };

const ACTIONS = { drafts: 'saveDraft', publish: 'publish', unpublish: 'unpublish', rename: 'rename' } as const;

export const routePaths = {
  list: () => '/stories',
  load: (slug: string) => `/stories/${encodeURIComponent(slug)}`,
  saveDraft: (slug: string) => `/stories/${encodeURIComponent(slug)}/drafts`,
  publish: (slug: string) => `/stories/${encodeURIComponent(slug)}/publish`,
  unpublish: (slug: string) => `/stories/${encodeURIComponent(slug)}/unpublish`,
  rename: (slug: string) => `/stories/${encodeURIComponent(slug)}/rename`,
  uploadMedia: () => '/media',
  session: () => '/session',
};

export function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.replace(/\/+$/, '');
  return trimmed.startsWith('/') || trimmed === '' ? trimmed : `/${trimmed}`;
}

/** Which route a URL path names, or null. Segments arrive percent-decoded. */
export function matchRoute(pathname: string, basePath: string): StoryRoute | null {
  const base = normalizeBasePath(basePath);
  if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return null;
  let segments: string[];
  try {
    segments = pathname.slice(base.length).split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [head, second, third, ...rest] = segments;
  if (head === 'stories') {
    if (second === undefined) return { name: 'list' };
    if (third === undefined) return { name: 'load', slug: second };
    if (rest.length === 0 && third in ACTIONS) return { name: ACTIONS[third as keyof typeof ACTIONS], slug: second };
    return null;
  }
  if (head === 'media') {
    if (second === undefined) return { name: 'uploadMedia' };
    return { name: 'serveMedia', key: segments.slice(1) };
  }
  if (head === 'session' && second === undefined) return { name: 'session' };
  return null;
}
