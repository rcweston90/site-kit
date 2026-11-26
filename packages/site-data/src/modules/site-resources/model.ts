/**
 * Which of the site's pages and resources visitors can find. Browser-safe.
 *
 * Both are stored the same way, one switch per path, and a path nobody has
 * switched is visible: a fresh database shows the whole site.
 */

/** A page the admin can hide from the nav, the sitemap and its own address. */
export interface SitePage {
  path: string;
  label: string;
}

/** A resource the admin can hide, such as a downloadable file's page. */
export interface SiteResource {
  /** A short name for code, e.g. `style-guide`. */
  id: string;
  path: string;
  label: string;
  /** Where it shows up on the site, for the settings row. */
  description: string;
}

export interface SiteResourcesConfig {
  pages: SitePage[];
  resources: SiteResource[];
}

export interface PageVisibility extends SitePage {
  enabled: boolean;
  version: number;
  updatedAt: string | null;
}

export interface ResourceVisibility extends SiteResource {
  visible: boolean;
  version: number;
  updatedAt: string | null;
}

const PATH = /^\/[a-z0-9\-/]*$/;

export function configureSiteResources(config: Partial<SiteResourcesConfig> | undefined): SiteResourcesConfig {
  const pages = config?.pages ?? [];
  const resources = config?.resources ?? [];
  for (const entry of [...pages, ...resources]) {
    if (!PATH.test(entry.path)) throw new Error(`site-resources: ${entry.path} isn't a site path like /stories.`);
  }
  const paths = [...pages, ...resources].map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error('site-resources: a path is listed twice.');
  return { pages: [...pages], resources: [...resources] };
}

/** Whether `path` is visible, given the stored switches. A hidden page hides what's under it too. */
export function isVisibleIn(switches: ReadonlyMap<string, boolean>, path: string): boolean {
  for (const [stored, enabled] of switches) {
    if (enabled) continue;
    if (path === stored || path.startsWith(`${stored}/`)) return false;
  }
  return true;
}
