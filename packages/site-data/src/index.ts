/*
 * @rcweston/site-data: the site's own settings, beside its stories.
 *
 * - createSiteData: the enabled modules' stores (memory or Postgres), their
 *   request handlers under `/api/site`, and the public reads pages call
 * - migrate / site-data-migrate: each module's explicit SQL migrations
 * - SITE_DATA_MODULES: the modules this package ships (registry.ts)
 * - defineModule: write your own (MODULES.md)
 */
export { createSiteData, DEFAULT_SITE_DATA_BASE_PATH, type SiteData, type SiteDataHandlerOptions, type SiteDataOptions } from './site-data.js';
export { SITE_DATA_MODULES, type SiteDataModules } from './registry.js';
export { collectMigrations, HOST_MIGRATION_RANGE, MIGRATION_RANGES, migrate, type MigrateOptions, type MigrateResult, type Migration } from './migrate.js';
export {
  defineModule,
  type ModuleConfig,
  type ModuleContext,
  type ModuleId,
  type ModuleReads,
  type ModuleRoute,
  type ModuleStore,
  type RouteMethod,
  type SiteDataModule,
  type SiteServices,
} from './module.js';
export { InvalidInputError, SITE_DATA_MESSAGES, VersionConflictError, expectedVersionOf, json, readBody, sameOrigin } from './http.js';
export { createMemoryTable, createPostgresTable, type PostgresTableShape, type Versioned, type VersionedTable } from './versioned.js';

export { siteResources, type SiteResourcesReads, type SiteResourcesStore } from './modules/site-resources/index.js';
export { workOrder, type WorkOrderReads, type WorkOrderStore } from './modules/work-order/index.js';
export { storyPlacement, currentPlacements, type StoryPlacement, type StoryPlacementReads, type StoryPlacementStore } from './modules/story-placement/index.js';
export { mediaLibrary, type MediaLibraryConfig, type MediaLibraryReads } from './modules/media-library/index.js';
export { resume, type ResumeBase, type ResumeConfig, type ResumeReads, type ResumeStore } from './modules/resume/index.js';
export { seo, type SeoConfig, type SeoReads, type SeoStore } from './modules/seo/index.js';
export { appearance, type AppearanceReads, type AppearanceStore } from './modules/appearance/index.js';
export { shots, configureShots, createMemoryShotsStore, createPostgresShotsStore, ingestImage, ingestWithoutSharp, readImageSize, type IngestImage, type IngestedImage, type NewShot, type ShotsConfig, type ShotsReads, type ShotsStore, type StoredShot } from './modules/shots/index.js';
export { home, type HomeReads, type HomeStore } from './modules/home/index.js';
export { community, type CommunityReads, type CommunityStore } from './modules/community/index.js';
export { showreel, type ShowreelReads, type ShowreelStore } from './modules/showreel/index.js';
export * from './client.js';
