/**
 * site-resources: page visibility and site resources, ported from the
 * dashboard's Page Visibility switches and its Site resources settings.
 *
 *   GET  /site-resources/pages       every configured page with its switch
 *   POST /site-resources/pages       { path, enabled, expectedVersion? }
 *   GET  /site-resources/resources   every configured resource with its switch
 *   POST /site-resources/resources   { resource, visible, expectedVersion? }
 */

import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  configureSiteResources,
  isVisibleIn,
  type PageVisibility,
  type ResourceVisibility,
  type SiteResourcesConfig,
} from './model.js';

export * from './model.js';

export type SiteResourcesStore = VersionedTable<boolean>;

export interface SiteResourcesReads {
  /** Paths switched off. */
  hiddenPaths(): Promise<string[]>;
  /** Whether a path (or anything it sits under) is switched off. */
  isPathVisible(path: string): Promise<boolean>;
  /** Each configured page with its switch, in config order. */
  pages(): Promise<PageVisibility[]>;
  /** Each configured resource with its switch, in config order. */
  resources(): Promise<ResourceVisibility[]>;
  /** `{ [resource id]: visible }`. */
  resourceVisibility(): Promise<Record<string, boolean>>;
}

const switchesOf = (rows: Versioned<boolean>[]) => new Map(rows.map((row) => [row.key, row.value]));

function pagesFrom(config: SiteResourcesConfig, rows: Versioned<boolean>[]): PageVisibility[] {
  const byPath = new Map(rows.map((row) => [row.key, row]));
  return config.pages.map((page) => {
    const row = byPath.get(page.path);
    return { ...page, enabled: row?.value ?? true, version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null };
  });
}

function resourcesFrom(config: SiteResourcesConfig, rows: Versioned<boolean>[]): ResourceVisibility[] {
  const byPath = new Map(rows.map((row) => [row.key, row]));
  return config.resources.map((resource) => {
    const row = byPath.get(resource.path);
    return { ...resource, visible: row?.value ?? true, version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null };
  });
}

export const siteResources = defineModule({
  id: 'site-resources',
  title: 'Page visibility and site resources',
  migrationRange: [1000, 1099],
  migrations: MIGRATIONS,
  configure: configureSiteResources,
  createMemoryStore: (): SiteResourcesStore => createMemoryTable<boolean>(),
  createPostgresStore: (sql): SiteResourcesStore =>
    createPostgresTable<boolean>(sql, {
      table: 'site_page_visibility',
      keyColumn: 'page_path',
      columns: ['enabled'],
      toRow: (enabled) => [enabled],
      fromRow: (row) => Boolean(row.enabled),
    }),
  handlers: ({ store, config, revalidate }) => [
    {
      method: 'GET',
      path: 'pages',
      handle: async () => json({ pages: pagesFrom(config, await store.all()) }),
    },
    {
      method: 'POST',
      path: 'pages',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const page = config.pages.find((entry) => entry.path === body.path);
        if (!page) throw new InvalidInputError('That page can’t be hidden here.');
        if (typeof body.enabled !== 'boolean') throw new InvalidInputError('Say whether the page should show.');
        const saved = await store.set(page.path, body.enabled, expectedVersionOf(body));
        await revalidate(['/', page.path]);
        return json({ page: { ...page, enabled: saved.value, version: saved.version, updatedAt: saved.updatedAt } });
      },
    },
    {
      method: 'GET',
      path: 'resources',
      handle: async () => json({ resources: resourcesFrom(config, await store.all()) }),
    },
    {
      method: 'POST',
      path: 'resources',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const resource = config.resources.find((entry) => entry.id === body.resource);
        if (!resource) throw new InvalidInputError('Choose a site resource.');
        if (typeof body.visible !== 'boolean') throw new InvalidInputError('Say whether the resource should show.');
        const saved = await store.set(resource.path, body.visible, expectedVersionOf(body));
        await revalidate(['/', resource.path]);
        return json({ resource: { ...resource, visible: saved.value, version: saved.version, updatedAt: saved.updatedAt } });
      },
    },
  ],
  publicReads: (store, config): SiteResourcesReads => ({
    hiddenPaths: async () => (await store.all()).filter((row) => !row.value).map((row) => row.key),
    isPathVisible: async (path) => isVisibleIn(switchesOf(await store.all()), path),
    pages: async () => pagesFrom(config, await store.all()),
    resources: async () => resourcesFrom(config, await store.all()),
    resourceVisibility: async () => Object.fromEntries(resourcesFrom(config, await store.all()).map((resource) => [resource.id, resource.visible])),
  }),
});
