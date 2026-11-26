import { randomBytes } from 'node:crypto';
import { createStoryHandlers, createMediaPolicy, type StoryHandlers } from '@rcweston/story-server';
import { createMemoryDocumentStore, createMemoryMediaStore } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import { SITE_DATA_MODULES, createSiteData, type SiteData } from '@rcweston/site-data';
import type { AuthAdapter, DocumentStore, MediaStore, Story } from '@rcweston/story-core';
import type { Pool } from 'pg';
import { seed } from '@/content/seed';
import { CUSTOM_BLOCK_NAMES } from '@/content/blocks-registry';
import { SITE_PAGES } from '@/content/site';
import { putSeedMedia, withSeedPhoto } from './seed-media';

/**
 * The demo's backend, picked from the environment:
 *
 * - Storage: in memory by default (resets on restart). Set
 *   SITE_KIT_DATABASE_URL to use Postgres; the demo runs story-server's and
 *   site-data's migrations on first use.
 * - Media: in memory by default. Set SITE_KIT_MEDIA_DIR to keep uploads on disk.
 * - Sign-in: a passcode. Set SITE_KIT_ADMIN_PASSCODE (six characters) and
 *   SITE_KIT_SESSION_SECRET (32 or more). Under `next dev` both have
 *   defaults: the passcode is `studio`, and the secret is made up at start,
 *   so a restart signs you out. A production build needs both.
 */

const STORY_BASE = '/api/story';
const SITE_BASE = '/api/site';
export const DEV_PASSCODE = 'studio';

async function createDatabase(): Promise<Pool | null> {
  const url = process.env.SITE_KIT_DATABASE_URL;
  if (!url) return null;
  const { default: pg } = await import('pg');
  return new pg.Pool({ connectionString: url });
}

async function createStore(pool: Pool | null): Promise<DocumentStore> {
  if (!pool) return createMemoryDocumentStore();
  const { createPostgresDocumentStore, migrate } = await import('@rcweston/story-server/postgres');
  await migrate({ client: pool });
  return createPostgresDocumentStore({ pool });
}

async function createMedia(): Promise<MediaStore> {
  const dir = process.env.SITE_KIT_MEDIA_DIR;
  if (!dir) return createMemoryMediaStore();
  const { createFsMediaStore } = await import('@rcweston/story-server/fs');
  return createFsMediaStore({ dir });
}

function createAuth(): AuthAdapter & { usingDevPasscode: boolean } {
  const passcode = process.env.SITE_KIT_ADMIN_PASSCODE;
  const secret = process.env.SITE_KIT_SESSION_SECRET;
  if (passcode && secret) return Object.assign(createPasscodeAuth({ passcode, secret }), { usingDevPasscode: false });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set SITE_KIT_ADMIN_PASSCODE and SITE_KIT_SESSION_SECRET before running the demo in production.');
  }
  return Object.assign(createPasscodeAuth({ passcode: passcode ?? DEV_PASSCODE, secret: secret ?? randomBytes(32).toString('hex') }), { usingDevPasscode: !passcode });
}

const SEED = { kind: 'seed', ref: 'content/seed.ts' };

/** Publishes the seed stories, saves the drafts and sets the Work order, once, on an empty store. */
async function seedStore(store: DocumentStore, site: DemoSiteData): Promise<void> {
  if ((await store.list()).length > 0) return;
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
}

async function createBackend(): Promise<DemoBackend> {
  const pool = await createDatabase();
  const [store, media] = await Promise.all([createStore(pool), createMedia()]);
  const site = createSiteData({
    modules: SITE_DATA_MODULES,
    sql: pool ?? undefined,
    config: { 'site-resources': { pages: SITE_PAGES, resources: [] } },
    services: { documents: store, media, mediaVisibility: 'public' },
  });
  if (pool) await site.migrate();
  await putSeedMedia(media);
  await seedStore(store, site);
  const auth = createAuth();
  const story = createStoryHandlers({
    store,
    media,
    auth,
    basePath: STORY_BASE,
    mediaPolicy: createMediaPolicy({ basePath: `${STORY_BASE}/media` }),
    customBlocks: CUSTOM_BLOCK_NAMES,
    uploadVisibility: 'public',
    otherAddresses: () => ['admin', 'api', 'samples', 'work'],
  });
  const { handle } = site.handlers({ auth, basePath: SITE_BASE, revalidate: revalidatePaths });
  return { story, store, site, siteHandler: handle, auth, usingDevPasscode: auth.usingDevPasscode };
}

/** Pages read on every request here, but a host with cached pages refreshes the ones a save changed. */
async function revalidatePaths(paths: string[]) {
  const { revalidatePath } = await import('next/cache');
  for (const path of paths) revalidatePath(path);
}

// Kept on globalThis so the in-memory store survives hot reloads in `next dev`.
const globalKey = Symbol.for('site-kit-demo.backend');
type Holder = { [globalKey]?: Promise<DemoBackend> };

export function backend(): Promise<DemoBackend> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createBackend().catch((error) => {
    delete holder[globalKey];
    throw error;
  });
  return holder[globalKey]!;
}
