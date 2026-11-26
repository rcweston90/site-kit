/**
 * What a site-data module is. Each module is one folder under
 * `src/modules/<id>/` whose index exports one of these, and one line in
 * `src/registry.ts` turns it on. See MODULES.md.
 */

import type { DocumentStore, MediaStore } from '@rcweston/story-core';
import type { SqlRunner } from '@rcweston/story-server/postgres';
import type { Migration } from './migrate.js';

/** What the host already has, for modules that read stories or media. */
export interface SiteServices {
  /** The story DocumentStore, for modules that list or order stories. */
  documents?: DocumentStore;
  /** The MediaStore uploads go to, for the media library. */
  media?: MediaStore;
  /** The address the site serves a media key at. Default `/api/story/media/<key>`. */
  mediaSrc?: (key: string) => string;
  /** Who may see uploads (labels only; serving stays with the story handlers). */
  mediaVisibility?: 'public' | 'protected';
}

export interface ModuleContext<Store, Config> {
  store: Store;
  config: Config;
  services: SiteServices;
  /** Tell the host which public paths changed. Never fails the request. */
  revalidate(paths: string[]): Promise<void>;
}

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ModuleRoute {
  method: RouteMethod;
  /**
   * Below the module's own prefix: `''` for `/<module id>`, `'pages'`,
   * `':slug'` (one segment, decoded), `'*rest'` (the rest of the path).
   */
  path: string;
  /** `admin` (the default) asks the AuthAdapter first; writes also refuse other sites. */
  access?: 'admin' | 'public';
  handle(input: { request: Request; params: Record<string, string>; url: URL }): Promise<Response>;
}

export interface SiteDataModule<Id extends string = string, Store = any, Reads = any, Config = any> {
  /** The folder name and the URL segment: `/api/site/<id>/…`. Lower-case words and hyphens. */
  id: Id;
  /** For people: what this module keeps. */
  title: string;
  /** The migration numbers this module owns, inclusive (see MODULES.md). */
  migrationRange: readonly [number, number];
  migrations: readonly Migration[];
  /** Fill in defaults for the host's config. */
  configure(config: Partial<Config> | undefined): Config;
  createMemoryStore(config: Config): Store;
  createPostgresStore(sql: SqlRunner, config: Config): Store;
  handlers(context: ModuleContext<Store, Config>): ModuleRoute[];
  /** What public pages read, with no session. */
  publicReads(store: Store, config: Config, services: SiteServices): Reads;
}

/** A helper that keeps a module's types, so the registry can name its reads. */
export function defineModule<Id extends string, Store, Reads, Config>(module: SiteDataModule<Id, Store, Reads, Config>) {
  return module;
}

export type ModuleId<M> = M extends SiteDataModule<infer Id, any, any, any> ? Id : never;
export type ModuleReads<M> = M extends SiteDataModule<any, any, infer Reads, any> ? Reads : never;
export type ModuleStore<M> = M extends SiteDataModule<any, infer Store, any, any> ? Store : never;
export type ModuleConfig<M> = M extends SiteDataModule<any, any, any, infer Config> ? Config : never;
