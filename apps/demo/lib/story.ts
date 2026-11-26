import { randomBytes } from 'node:crypto';
import { createStoryHandlers, createMediaPolicy, type StoryHandlers } from '@rcweston/story-server';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import { EMPTY_SEO_OVERRIDE, SITE_DATA_MODULES, createSiteData, seedBlog, type SiteData } from '@rcweston/site-data';
import type { AuthAdapter, DocumentStore, Story } from '@rcweston/story-core';
import { seed } from '@/content/seed';
import { blogSeed } from '@/content/blog-seed';
import { SEO_SEED } from '@/content/seo';
import { CUSTOM_BLOCK_NAMES } from '@/content/blocks-registry';
import { SITE, SITE_PAGES } from '@/content/site';
import { RESUME_BASE, SEO_FALLBACKS, SITE_RESOURCES } from './settings';
import { adminProblem, planStorage, readConfig, type SiteKitConfig, type StoragePlan } from './config';
import { describeStorage, openDatabase, openDocuments, openMedia, type Database } from './storage';
import { putSeedMedia, withSeedPhoto } from './seed-media';
import { seedShots } from './seed-shots';
import { SEED_HEADER, SHOWREEL_RESOURCE, publishingConfig, putPublishingMedia } from './publishing';
import { seedCompanies, seedMemberships, seedPrototypeMemberships, seedPrototypeOrder, seedPrototypes, siteFeatures } from '@/content/companies';

/**
 * The site's backend, built from `lib/config.ts`:
 *
 * - Stories and site settings: embedded Postgres (PGlite) in `.data/` by
 *   default, so they last across restarts; any Postgres when
 *   SITE_KIT_DATABASE_URL is set; memory with SITE_KIT_STORAGE=memory.
 *   Migrations run on first use unless SITE_KIT_AUTO_MIGRATE=false, in which
 *   case run `pnpm db:migrate`.
 * - Uploads: on disk in `.data/media` by default, or an S3-compatible bucket
 *   when the SITE_KIT_S3_* variables are set.
 * - Sign-in: a passcode. Set SITE_KIT_ADMIN_PASSCODE and
 *   SITE_KIT_SESSION_SECRET (32 or more characters). Under `next dev` both
 *   have defaults: the passcode is `studio`, and the secret is made up at
 *   start, so a restart signs you out. A production server needs both;
 *   without them the public site runs and the admin says what to set.
 *
 * The seed stories are written once, into an empty store.
 */

const STORY_BASE = '/api/story';
const SITE_BASE = '/api/site';
export const DEV_PASSCODE = 'studio';

async function createAuth(config: SiteKitConfig, database: Database | null): Promise<AuthAdapter & { usingDevPasscode: boolean }> {
  const problem = adminProblem(config);
  if (problem) {
    console.warn(`[site-kit] ${problem}`);
    return Object.assign(lockedAuth(problem), { usingDevPasscode: false });
  }
  const { passcode, secret } = config.auth;
  // With a database, sign-in attempts are counted there, so the limit holds across instances.
  const rateLimiter = database
    ? (await import('@rcweston/story-server/postgres')).createPostgresRateLimiter({ pool: database.sql })
    : undefined;
  const auth = createPasscodeAuth({
    passcode: passcode ?? DEV_PASSCODE,
    secret: secret ?? randomBytes(32).toString('hex'),
    ...(rateLimiter ? { rateLimiter } : {}),
  });
  return Object.assign(auth, { usingDevPasscode: !passcode });
}

/**
 * Sign-in when it isn't set up: nobody is signed in, and every admin request
 * (signing in included) gets a 503 that says what to set. Public reads don't
 * ask the adapter for more than "not signed in", so the site keeps working.
 */
function lockedAuth(problem: string): AuthAdapter & { signIn(request: Request): Promise<Response> } {
  const refuse = () => Response.json({ error: problem }, { status: 503, headers: { 'cache-control': 'no-store' } });
  return {
    getSession: async () => null,
    requireAdmin: async () => { throw refuse(); },
    canViewProtected: async () => false,
    signIn: async () => refuse(),
  };
}

const SEED = { kind: 'seed', ref: 'content/seed.ts' };

/**
 * Publishes the seed stories, saves the drafts and sets the Work order, once,
 * on an empty store. The Work order it sets marks the store as seeded, so
 * deleting every story doesn't bring the samples back on the next start.
 */
async function seedStore(store: DocumentStore, site: DemoSiteData): Promise<void> {
  if ((await store.list()).length > 0 || (await site.stores['work-order'].get('stories'))) return;
  const save = (content: Story, parentDocumentId: string | null, source = SEED) =>
    store.saveDraft({ slug: content.slug, content: withSeedPhoto(content), parentDocumentId, source });
  const publish = (slug: string, documentId: string, expectedPublishedDocumentId: string | null = null) =>
    store.publish({ slug, documentId, expectedPublishedDocumentId, publishedBy: 'seed' });

  for (const content of seed.published) {
    const document = await save(content, null);
    await publish(content.slug, document.id);
  }
  for (const content of seed.drafts) await save(content, null);

  // A draft restored from before the last publish: the editor shows what the
  // published version has that the draft doesn't.
  const { first, published, restored } = seed.drift;
  const firstDraft = await save(first, null);
  const live = await save(published, firstDraft.id);
  await publish(published.slug, live.id);
  await save(restored, live.id, { kind: 'restore', ref: firstDraft.id });

  await site.stores['work-order'].set('stories', seed.order);
  for (const slug of seed.hidden) await site.stores['story-placement'].set(slug, false);
  await site.stores.home.headerImages.set('header-images', SEED_HEADER);

  // The companies the stories belong to, and the prototypes beside them.
  for (const [slug, record] of Object.entries(seedCompanies)) await site.stores.companies.create(slug, record);
  for (const [storySlug, companySlug] of Object.entries({ ...seedMemberships, ...seedPrototypeMemberships })) await site.stores.companies.assign(storySlug, companySlug);
  for (const [slug, fields] of Object.entries(seedPrototypes)) await site.stores.projects.records.set(slug, fields, 0);
  await site.stores['work-order'].set('prototypes', seedPrototypeOrder);
  await site.stores.seo.defaults.set('site', SEO_SEED.defaults);
  for (const [path, override] of Object.entries(SEO_SEED.overrides)) {
    await site.stores.seo.overrides.set(path, { ...EMPTY_SEO_OVERRIDE, ...override });
  }
}

type DemoSiteData = SiteData<typeof SITE_DATA_MODULES>;

export interface DemoBackend {
  story: StoryHandlers;
  store: DocumentStore;
  site: DemoSiteData;
  siteHandler: (request: Request) => Promise<Response>;
  auth: AuthAdapter;
  /** True when the passcode is the development default. */
  usingDevPasscode: boolean;
  /** Storage that won't last, in plain sentences. */
  warnings: string[];
  /** Closes the database. */
  close(): Promise<void>;
}

/** Opens storage, migrates, seeds once and builds the handlers. `backend()` keeps one per server; tests call this directly. */
export async function createBackend(config: SiteKitConfig = readConfig()): Promise<DemoBackend> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // Pages that read stories are rendered per request; opening the database
    // from several build workers at once would damage an embedded one.
    throw new Error('The backend was opened during `next build`. Mark the page `export const dynamic = \'force-dynamic\'`.');
  }
  const plan = planStorage(config);
  for (const warning of plan.warnings) console.warn(`[site-kit] ${warning}`);
  console.info(`[site-kit] ${describeStorage(plan.storage, plan.media)}`);

  const database = await openDatabase(plan.storage);
  try {
    const [store, media] = await Promise.all([openDocuments(database, { migrate: config.autoMigrate }), openMedia(plan.media)]);
    const site: DemoSiteData = createSiteData({
      modules: SITE_DATA_MODULES,
      sql: database?.sql,
      config: {
        'site-resources': { pages: SITE_PAGES, resources: [...SITE_RESOURCES, SHOWREEL_RESOURCE] },
        resume: { base: RESUME_BASE, downloadName: `${SITE.name} - Resume.pdf` },
        seo: { siteUrl: config.siteUrl.toString(), fallbacks: SEO_FALLBACKS },
        blog: { caseStudyBasePath: '/stories' },
        ...publishingConfig,
        'work-order': { lists: ['stories', 'prototypes'] },
        // A company's asset folder lists the Work records that name it.
        companies: { workRecords: async () => (await site.reads.projects.records()).map(({ slug, title, org, type }) => ({ slug, title, org, type })) },
        projects: { features: siteFeatures },
      },
      services: { documents: store, media, mediaVisibility: 'public' },
    });
    if (database && config.autoMigrate) await site.migrate();
    if (database && !config.autoMigrate) await requireMigrated(database, site);
    if (config.seed) {
      await putSeedMedia(media);
      await putPublishingMedia(media);
      await seedStore(store, site);
      await seedShots(site.stores['shots'], media);
      await seedBlog(site.stores.blog, blogSeed);
    }
    const auth = await createAuth(config, database);
    const story = createStoryHandlers({
      store,
      media,
      auth,
      basePath: STORY_BASE,
      mediaPolicy: createMediaPolicy({ basePath: `${STORY_BASE}/media` }),
      customBlocks: CUSTOM_BLOCK_NAMES,
      uploadVisibility: 'public',
      otherAddresses: () => ['admin', 'api', 'samples', 'work', 'community', 'showreel'],
    });
    const { handle } = site.handlers({ auth, basePath: SITE_BASE, revalidate: revalidatePaths });
    return {
      story, store, site, siteHandler: handle, auth, usingDevPasscode: auth.usingDevPasscode, warnings: plan.warnings,
      close: async () => { await database?.close(); },
    };
  } catch (error) {
    // A half-built backend mustn't keep the embedded database open: the retry opens it again.
    await database?.close().catch(() => undefined);
    throw error;
  }
}

/** With SITE_KIT_AUTO_MIGRATE=false, a database that's behind stops the server with the command that fixes it. */
async function requireMigrated(database: Database, site: DemoSiteData): Promise<void> {
  const { migrate } = await import('@rcweston/story-server/postgres');
  const pending = [
    ...(await migrate({ client: database.sql, dryRun: true })).pending,
    ...(await site.migrate({ dryRun: true })).pending,
  ];
  if (pending.length) {
    throw new Error(`The database needs ${pending.length} migration(s) (${pending.join(', ')}). Run \`pnpm db:migrate\`, or unset SITE_KIT_AUTO_MIGRATE.`);
  }
}

const planKey = Symbol.for('site-kit-demo.storage-plan');

/** What storage the site uses and why, worked out once per server. The admin shows the warnings. */
export function storagePlan(config: SiteKitConfig = readConfig()): StoragePlan {
  const holder = globalThis as { [planKey]?: StoragePlan };
  return (holder[planKey] ??= planStorage(config));
}

/** Pages read on every request here, but a host with cached pages refreshes the ones a save changed. */
async function revalidatePaths(paths: string[]) {
  const { revalidatePath } = await import('next/cache');
  for (const path of paths) revalidatePath(path);
}

// Kept on globalThis so one server opens its storage once, even across hot reloads in `next dev`.
const globalKey = Symbol.for('site-kit-demo.backend');
type Holder = { [globalKey]?: Promise<DemoBackend> };

export function backend(): Promise<DemoBackend> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createBackend(readConfig()).catch((error) => {
    delete holder[globalKey];
    throw error;
  });
  return holder[globalKey]!;
}
