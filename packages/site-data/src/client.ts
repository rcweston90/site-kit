/**
 * The browser-safe half: each module's types and pure helpers, and the
 * routes the handlers answer, so an admin screen can call them without
 * pulling in a store.
 */
export * from './modules/site-resources/model.js';
export * from './modules/work-order/model.js';
export * from './modules/story-placement/model.js';
export * from './modules/media-library/model.js';
export * from './modules/resume/model.js';
export * from './modules/seo/model.js';
export * from './modules/appearance/model.js';
export * from './modules/shots/model.js';
export * from './modules/home/model.js';
export * from './modules/community/model.js';
export * from './modules/showreel/model.js';
export * from './modules/blog/model.js';
export * from './modules/companies/model.js';
export * from './modules/projects/model.js';

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
  resume: () => '/resume',
  seo: () => '/seo',
  seoOverrides: () => '/seo/overrides',
  appearance: () => '/appearance',
  shots: () => '/shots',
  companies: (slug?: string, part?: 'logo' | 'assets') => (slug ? `/companies/profile/${encodeURIComponent(slug)}${part ? `/${part}` : ''}` : '/companies'),
  companyAssign: () => '/companies/assign',
  projects: (slug?: string, part?: 'duplicate') => (slug ? `/projects/${encodeURIComponent(slug)}${part ? `/${part}` : ''}` : '/projects'),
  projectsBulk: () => '/projects/bulk',
};
