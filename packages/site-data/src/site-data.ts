/**
 * Put the enabled modules together: one store each (memory, or Postgres when
 * you pass a client), the request handlers under one base path, and the
 * public reads your pages call.
 */

import type { AuthAdapter } from '@rcweston/story-core';
import { createSqlRunner, type SqlPool } from '@rcweston/story-server/postgres';
import { InvalidInputError, SITE_DATA_MESSAGES, VersionConflictError, json, sameOrigin } from './http.js';
import { migrate, type Migration, type MigrateResult } from './migrate.js';
import type { ModuleConfig, ModuleReads, ModuleRoute, ModuleStore, SiteDataModule, SiteServices } from './module.js';

import { DEFAULT_SITE_DATA_BASE_PATH } from './client.js';

export { DEFAULT_SITE_DATA_BASE_PATH };

type IdOf<M> = M extends SiteDataModule<infer Id, any, any, any> ? Id : never;
type ById<Modules extends readonly SiteDataModule[], Pick extends 'reads' | 'store' | 'config'> = {
  [M in Modules[number] as IdOf<M>]: Pick extends 'reads' ? ModuleReads<M> : Pick extends 'store' ? ModuleStore<M> : Partial<ModuleConfig<M>>;
};

export interface SiteDataOptions<Modules extends readonly SiteDataModule[]> {
  modules: Modules;
  /** A Postgres pool or client. Without one, every module keeps its data in memory. */
  sql?: SqlPool;
  /** Each module's settings, by module id. */
  config?: Partial<ById<Modules, 'config'>>;
  services?: SiteServices;
}

export interface SiteDataHandlerOptions {
  auth: AuthAdapter;
  /** Where the handlers are mounted. Default `/api/site`. */
  basePath?: string;
  /** Called with the public paths a save changed, e.g. to `revalidatePath`. A failure never fails the save. */
  revalidate?: (paths: string[], event: { module: string }) => void | Promise<void>;
  /** Refuse writes whose `Origin` names another host. Default true. */
  checkOrigin?: boolean;
  onError?: (error: unknown, context: { route: string }) => void;
}

export interface SiteData<Modules extends readonly SiteDataModule[]> {
  modules: Modules;
  stores: ById<Modules, 'store'>;
  /** What public pages read, by module id. */
  reads: ById<Modules, 'reads'>;
  /** Apply the enabled modules' pending migrations (Postgres only). */
  migrate(options?: { dryRun?: boolean; extra?: Migration[] }): Promise<MigrateResult>;
  /** One handler for every module's routes, for a catch-all mount. */
  handlers(options: SiteDataHandlerOptions): { handle: (request: Request) => Promise<Response>; routes: { module: string; method: string; path: string }[] };
}

interface Compiled {
  module: string;
  route: ModuleRoute;
  segments: string[];
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index++) {
    const part = pattern[index];
    if (part.startsWith('*')) {
      params[part.slice(1)] = actual.slice(index).join('/');
      return params;
    }
    const value = actual[index];
    if (value === undefined) return null;
    if (part.startsWith(':')) params[part.slice(1)] = value;
    else if (part !== value) return null;
  }
  return pattern.length === actual.length ? params : null;
}

export function createSiteData<const Modules extends readonly SiteDataModule[]>(options: SiteDataOptions<Modules>): SiteData<Modules> {
  const { modules } = options;
  const services = options.services ?? {};
  const sql = options.sql ? createSqlRunner(options.sql) : null;
  const ids = new Set<string>();
  const stores: Record<string, unknown> = {};
  const reads: Record<string, unknown> = {};
  const configs: Record<string, unknown> = {};
  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Two modules are called ${module.id}.`);
    ids.add(module.id);
    const config = module.configure((options.config as Record<string, unknown> | undefined)?.[module.id] as never);
    configs[module.id] = config;
    stores[module.id] = sql ? module.createPostgresStore(sql, config) : module.createMemoryStore(config);
    reads[module.id] = module.publicReads(stores[module.id], config, services);
  }

  return {
    modules,
    stores: stores as ById<Modules, 'store'>,
    reads: reads as ById<Modules, 'reads'>,
    migrate: async (migrateOptions = {}) => {
      if (!options.sql) throw new Error('site-data keeps its data in memory here; pass `sql` to migrate a database.');
      return migrate({ client: options.sql, modules, extra: migrateOptions.extra, dryRun: migrateOptions.dryRun });
    },
    handlers(handlerOptions) {
      const basePath = (handlerOptions.basePath ?? DEFAULT_SITE_DATA_BASE_PATH).replace(/\/+$/, '');
      const checkOrigin = handlerOptions.checkOrigin ?? true;
      const onError = handlerOptions.onError ?? ((error: unknown, context: { route: string }) => console.error(`[site-data] ${context.route} failed:`, error));
      const compiled = new Map<string, Compiled[]>();
      for (const module of modules) {
        const revalidate = async (paths: string[]) => {
          try {
            await handlerOptions.revalidate?.(paths, { module: module.id });
          } catch (error) {
            onError(error, { route: `${module.id} (revalidate)` });
          }
        };
        const routes = module.handlers({ store: stores[module.id], config: configs[module.id], services, revalidate });
        compiled.set(
          module.id,
          routes.map((route) => ({ module: module.id, route, segments: route.path.split('/').filter(Boolean) })),
        );
      }

      async function handle(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return json({ error: SITE_DATA_MESSAGES.notFound }, 404);
        let segments: string[];
        try {
          segments = url.pathname.slice(basePath.length).split('/').filter(Boolean).map(decodeURIComponent);
        } catch {
          return json({ error: SITE_DATA_MESSAGES.notFound }, 404);
        }
        const [moduleId, ...rest] = segments;
        const candidates = (moduleId && compiled.get(moduleId)) || [];
        const matching = candidates.flatMap((entry) => {
          const params = matchSegments(entry.segments, rest);
          return params ? [{ entry, params }] : [];
        });
        if (matching.length === 0) return json({ error: SITE_DATA_MESSAGES.notFound }, 404);
        const hit = matching.find(({ entry }) => entry.route.method === request.method);
        if (!hit) {
          return json({ error: SITE_DATA_MESSAGES.method }, 405, { allow: [...new Set(matching.map(({ entry }) => entry.route.method))].join(', ') });
        }
        const label = `${hit.entry.module} ${hit.entry.route.method} ${hit.entry.route.path || '/'}`;
        try {
          const write = request.method !== 'GET' && request.method !== 'HEAD';
          if (write && checkOrigin && !sameOrigin(request)) return json({ error: SITE_DATA_MESSAGES.crossSite, code: 'UNAUTHORIZED' }, 403);
          if ((hit.entry.route.access ?? 'admin') === 'admin') await handlerOptions.auth.requireAdmin(request);
          return await hit.entry.route.handle({ request, params: hit.params, url });
        } catch (error) {
          if (error instanceof Response) return error;
          if (error instanceof VersionConflictError) return json({ error: error.message, code: 'CONFLICT', current: error.current }, 409);
          if (error instanceof InvalidInputError) return json({ error: error.message, code: 'INVALID' }, 400);
          onError(error, { route: label });
          return json({ error: SITE_DATA_MESSAGES.server }, 500);
        }
      }

      return {
        handle,
        routes: [...compiled.values()].flat().map(({ module, route }) => ({ module, method: route.method, path: `${basePath}/${module}${route.path ? `/${route.path}` : ''}` })),
      };
    },
  };
}
