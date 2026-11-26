'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SaveRequestError } from '@rcweston/save-kit';
import { DEFAULT_SITE_DATA_BASE_PATH } from '@rcweston/site-data/client';
import { AdminRouterProvider, type AdminRouter } from './router.js';
import type { AdminModule } from './modules/define.js';

/** Where the admin lives and which endpoints it talks to. */
export interface AdminConfig {
  /** The admin's own address. Default `/admin`. */
  adminBase: string;
  /** story-server's handlers. Default `/api/story`. */
  storyApi: string;
  /** site-data's handlers. Default `/api/site`. */
  siteApi: string;
  /** Where a published story is read, for "View" links. Default `/stories/:slug`. */
  storyHref: (slug: string) => string;
  /** The public site's home, for "View site". Default `/`. */
  siteHref: string;
  /** The editor for a story. Default `<adminBase>/stories/:slug`. */
  editorHref: (slug: string) => string;
  /** Routes that take the whole window (no sidebar), such as the story editor. */
  isFullscreen: (pathname: string) => boolean;
  /** The work-order list stories are ordered in. Default `stories`. */
  workList: string;
  /** Uploads one image for the admin's image fields and answers its address.
   *  Default: story-server's media route, filed under the `site` folder. */
  uploadImage: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
  /** Where a story's media address loads from in the browser (thumbnails). Default: as written. */
  mediaSrc: (src: string) => string;
}

/** POSTs to story-server's `/media` route, reporting progress where the browser can. */
export function storyMediaUploader(storyApi: string, folder = 'site'): AdminConfig['uploadImage'] {
  return (file, onProgress) => new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('slug', folder);
    form.append('file', file);
    const request = new XMLHttpRequest();
    request.open('POST', `${storyApi}/media`);
    request.withCredentials = true;
    request.timeout = 60_000;
    if (onProgress) request.upload.addEventListener('progress', (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); });
    request.addEventListener('load', () => {
      let body: { src?: unknown; error?: unknown } = {};
      try { body = JSON.parse(request.responseText) as typeof body; } catch { /* not JSON */ }
      if (request.status >= 200 && request.status < 300 && typeof body.src === 'string') resolve(body.src);
      else reject(new SaveRequestError(request.status === 401 || request.status === 403 ? 'session' : request.status === 413 ? 'too-large' : request.status >= 500 ? 'server' : 'refused', request.status, typeof body.error === 'string' ? body.error : null));
    });
    request.addEventListener('error', () => reject(new SaveRequestError('offline', 0, null)));
    request.addEventListener('timeout', () => reject(new SaveRequestError('offline', 0, null)));
    request.send(form);
  });
}

export function resolveAdminConfig(partial: Partial<AdminConfig> = {}): AdminConfig {
  const adminBase = (partial.adminBase ?? '/admin').replace(/\/$/, '');
  const editorHref = partial.editorHref ?? ((slug: string) => `${adminBase}/stories/${encodeURIComponent(slug)}`);
  const editorPattern = new RegExp(`^${adminBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/stories/(?!new(?:/|$))[^/]+(?:/|$)`);
  return {
    adminBase,
    storyApi: partial.storyApi ?? '/api/story',
    siteApi: partial.siteApi ?? DEFAULT_SITE_DATA_BASE_PATH,
    storyHref: partial.storyHref ?? ((slug) => `/stories/${encodeURIComponent(slug)}`),
    siteHref: partial.siteHref ?? '/',
    editorHref,
    isFullscreen: partial.isFullscreen ?? ((pathname) => editorPattern.test(pathname)),
    workList: partial.workList ?? 'stories',
    uploadImage: partial.uploadImage ?? storyMediaUploader(partial.storyApi ?? '/api/story'),
    mediaSrc: partial.mediaSrc ?? ((src) => src),
  };
}

interface AdminContextValue {
  config: AdminConfig;
  modules: readonly AdminModule[];
}

const AdminContext = createContext<AdminContextValue>({ config: resolveAdminConfig(), modules: [] });

/**
 * Everything the admin needs from its host, given once: the router, where the
 * endpoints are, and the enabled modules (whose nav items, stats and quick
 * actions make up the sidebar and the dashboard).
 */
export function AdminProvider({ router, config, modules, children }: {
  router: AdminRouter;
  config?: Partial<AdminConfig>;
  modules: readonly AdminModule[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ config: resolveAdminConfig(config), modules }), [config, modules]);
  return (
    <AdminRouterProvider router={router}>
      <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
    </AdminRouterProvider>
  );
}

export const useAdminConfig = () => useContext(AdminContext).config;
export const useAdminModules = () => useContext(AdminContext).modules;

/** Resolve a module's admin-relative path (`''`, `stories`, `stories/new`) against the admin's base. */
export function adminPath(config: Pick<AdminConfig, 'adminBase'>, path: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('/')) return path;
  return path ? `${config.adminBase}/${path}` : config.adminBase;
}
