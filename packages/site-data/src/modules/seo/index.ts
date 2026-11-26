/**
 * seo: site-wide search and sharing defaults and per-page overrides.
 *
 *   GET    /seo             SeoState: the defaults with their version, and every override
 *   PUT    /seo             { defaults, expectedVersion? }
 *   PUT    /seo/overrides   { path, override, expectedVersion? }
 *   DELETE /seo/overrides   { path, expectedVersion? }
 *
 * Public pages build their metadata with `reads.seo.metadata(path, …)`, which
 * merges the override, the page's own content, the saved defaults and the
 * host's fallbacks (`config.fallbacks`). Nothing here talks to an analytics
 * or search vendor.
 */

import { defineModule } from '../../module.js';
import { InvalidInputError, VersionConflictError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  EMPTY_SEO_DEFAULTS,
  SeoInputError,
  isSeoPath,
  parseSeoDefaults,
  parseSeoOverride,
  resolvePageMetadata,
  storedDefaults,
  storedOverride,
  type PageMetadata,
  type SeoContentMeta,
  type SeoDefaults,
  type SeoFallbacks,
  type SeoOverrideRecord,
  type SeoPageOverride,
  type SeoState,
} from './model.js';

export * from './model.js';

export interface SeoConfig {
  /** What pages say when nothing is saved. */
  fallbacks: SeoFallbacks;
  /** The site's address, for absolute links. Pages may pass their own. */
  siteUrl: string;
  /** Paths refreshed after the defaults change. Default `['/']` (the whole site's layout). */
  revalidate: string[];
}

export interface SeoStore {
  defaults: VersionedTable<SeoDefaults>;
  overrides: VersionedTable<SeoPageOverride>;
}

export interface SeoReads {
  defaults(): Promise<SeoDefaults>;
  override(path: string): Promise<SeoPageOverride | null>;
  overrides(): Promise<SeoOverrideRecord[]>;
  /** A page's metadata, for `generateMetadata`. Never throws: a failed read uses the fallbacks. */
  metadata(path: string, options?: { content?: SeoContentMeta; hidden?: boolean; siteUrl?: URL | string }): Promise<PageMetadata>;
}

const DEFAULTS_KEY = 'site';

function configureSeo(config: Partial<SeoConfig> | undefined): SeoConfig {
  const siteName = config?.fallbacks?.siteName ?? 'My site';
  return {
    fallbacks: {
      titleTemplate: `%s · ${siteName}`,
      defaultTitle: siteName,
      description: '',
      keywords: [],
      siteName,
      ...config?.fallbacks,
    },
    siteUrl: config?.siteUrl ?? 'http://localhost:3000',
    revalidate: config?.revalidate ?? ['/'],
  };
}

const recordOf = (row: Versioned<SeoPageOverride>): SeoOverrideRecord => ({ ...storedOverride(row.value), path: row.key, version: row.version, updatedAt: row.updatedAt });

async function stateOf(store: SeoStore, config: SeoConfig): Promise<SeoState> {
  const [defaults, overrides] = await Promise.all([store.defaults.get(DEFAULTS_KEY), store.overrides.all()]);
  return {
    defaults: defaults ? storedDefaults(defaults.value) : EMPTY_SEO_DEFAULTS,
    version: defaults?.version ?? 0,
    updatedAt: defaults?.updatedAt ?? null,
    overrides: overrides.map(recordOf).sort((a, b) => a.path.localeCompare(b.path)),
    fallbacks: config.fallbacks,
  };
}

const parse = <T,>(read: () => T): T => {
  try {
    return read();
  } catch (error) {
    if (error instanceof SeoInputError) throw new InvalidInputError(error.message);
    throw error;
  }
};

const pathOf = (body: Record<string, unknown>): string => {
  if (!isSeoPath(body.path)) throw new InvalidInputError('Choose the page this override is for, as a path like /work.');
  return body.path;
};

export const seo = defineModule({
  id: 'seo',
  title: 'SEO',
  migrationRange: [2600, 2699],
  migrations: MIGRATIONS,
  configure: configureSeo,
  createMemoryStore: (): SeoStore => ({ defaults: createMemoryTable<SeoDefaults>(), overrides: createMemoryTable<SeoPageOverride>() }),
  createPostgresStore: (sql): SeoStore => ({
    defaults: createPostgresTable<SeoDefaults>(sql, {
      table: 'site_seo_defaults', keyColumn: 'key', columns: ['body'],
      toRow: (value) => [JSON.stringify(value)], fromRow: (row) => storedDefaults(row.body),
    }),
    overrides: createPostgresTable<SeoPageOverride>(sql, {
      table: 'site_seo_page_overrides', keyColumn: 'page_path', columns: ['body'],
      toRow: (value) => [JSON.stringify(value)], fromRow: (row) => storedOverride(row.body),
    }),
  }),
  handlers: ({ store, config, revalidate }) => [
    { method: 'GET', path: '', handle: async () => json(await stateOf(store, config)) },
    {
      method: 'PUT',
      path: '',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const defaults = parse(() => parseSeoDefaults(body.defaults));
        const saved = await store.defaults.set(DEFAULTS_KEY, defaults, expectedVersionOf(body));
        await revalidate(config.revalidate);
        return json({ defaults: saved.value, version: saved.version, updatedAt: saved.updatedAt });
      },
    },
    {
      method: 'PUT',
      path: 'overrides',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const path = pathOf(body);
        const override = parse(() => parseSeoOverride(body.override));
        const saved = await store.overrides.set(path, override, expectedVersionOf(body));
        await revalidate([path]);
        return json({ override: recordOf(saved) });
      },
    },
    {
      method: 'DELETE',
      path: 'overrides',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const path = pathOf(body);
        const expected = expectedVersionOf(body);
        const current = await store.overrides.get(path);
        if (expected !== undefined && (current?.version ?? 0) !== expected) throw new VersionConflictError(current ? recordOf(current) : null);
        await store.overrides.remove(path);
        await revalidate([path]);
        return json({ removed: path });
      },
    },
  ],
  publicReads: (store, config): SeoReads => ({
    defaults: async () => storedDefaults((await store.defaults.get(DEFAULTS_KEY))?.value),
    override: async (path) => {
      const row = await store.overrides.get(path);
      return row ? storedOverride(row.value) : null;
    },
    overrides: async () => (await stateOf(store, config)).overrides,
    metadata: async (path, options = {}) => {
      let defaults: SeoDefaults | null = null;
      let override: SeoPageOverride | null = null;
      try {
        const [savedDefaults, savedOverride] = await Promise.all([store.defaults.get(DEFAULTS_KEY), store.overrides.get(path)]);
        defaults = savedDefaults ? storedDefaults(savedDefaults.value) : null;
        override = savedOverride ? storedOverride(savedOverride.value) : null;
      } catch (error) {
        // Unavailable: the fallbacks still describe the page.
        console.error('[site-data] seo: reading the saved metadata failed:', error);
      }
      return resolvePageMetadata({
        path,
        siteUrl: options.siteUrl ?? config.siteUrl,
        fallbacks: config.fallbacks,
        defaults,
        override,
        content: options.content,
        hidden: options.hidden,
      });
    },
  }),
});
