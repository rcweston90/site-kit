/**
 * The browser-safe half: each module's types and pure helpers, and the
 * routes the handlers answer, so an admin screen can call them without
 * pulling in a store.
 */
export * from './modules/site-resources/model.js';
export * from './modules/work-order/model.js';
export * from './modules/story-placement/model.js';
export * from './modules/media-library/model.js';

/** Where the handlers are mounted unless you say otherwise. */
export const DEFAULT_SITE_DATA_BASE_PATH = '/api/site';

/** The handlers' routes, relative to where you mount them (default `/api/site`). */
export const siteDataPaths = {
  pages: () => '/site-resources/pages',
  resources: () => '/site-resources/resources',
  workOrder: (list?: string) => (list ? `/work-order?list=${encodeURIComponent(list)}` : '/work-order'),
  placements: () => '/story-placement',
  placement: (slug: string) => `/story-placement/${encodeURIComponent(slug)}`,
  mediaLibrary: (params?: URLSearchParams) => `/media-library${params && [...params].length ? `?${params}` : ''}`,
  mediaLibraryItem: (key: string) => `/media-library/item?key=${encodeURIComponent(key)}`,
};
