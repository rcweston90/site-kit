import { createStoryHandlers, createMediaPolicy, type StoryHandlers } from '@rcweston/story-server';
import { createMemoryDocumentStore, createMemoryMediaStore, createOpenAuth } from '@rcweston/story-server/memory';
import { createPasscodeAuth } from '@rcweston/story-server/passcode';
import type { AuthAdapter, DocumentStore, MediaStore } from '@rcweston/story-core';
import { seed } from '@/content/seed';
import { CUSTOM_BLOCK_NAMES } from '@/content/blocks-registry';

/**
 * The demo's backend, picked from the environment:
 *
 * - Storage: in memory by default (resets on restart). Set DATABASE_URL to
 *   use Postgres; the demo runs the migrations on first use.
 * - Media: in memory by default. Set STORY_MEDIA_DIR to keep uploads on disk.
 * - Sign-in: set STORY_ADMIN_PASSCODE and STORY_SESSION_SECRET to require a
 *   passcode. Without them the editor is open to anyone, which the demo
 *   allows only in `next dev`, or when STORY_DEMO_OPEN_EDITING=1 says you
 *   mean it (for `next start` on your own machine).
 */

const BASE_PATH = '/api/story';

async function createStore(): Promise<DocumentStore> {
  const url = process.env.DATABASE_URL;
  if (!url) return createMemoryDocumentStore();
  const [{ default: pg }, { createPostgresDocumentStore, migrate }] = await Promise.all([
    import('pg'),
    import('@rcweston/story-server/postgres'),
  ]);
  const pool = new pg.Pool({ connectionString: url });
  await migrate({ client: pool });
  return createPostgresDocumentStore({ pool });
}

async function createMedia(): Promise<MediaStore> {
  const dir = process.env.STORY_MEDIA_DIR;
  if (!dir) return createMemoryMediaStore();
  const { createFsMediaStore } = await import('@rcweston/story-server/fs');
  return createFsMediaStore({ dir });
}

function createAuth(): AuthAdapter & { open: boolean } {
  const passcode = process.env.STORY_ADMIN_PASSCODE;
  const secret = process.env.STORY_SESSION_SECRET;
  if (passcode && secret) return Object.assign(createPasscodeAuth({ passcode, secret }), { open: false });
  if (process.env.NODE_ENV === 'production' && process.env.STORY_DEMO_OPEN_EDITING !== '1') {
    throw new Error(
      'Set STORY_ADMIN_PASSCODE and STORY_SESSION_SECRET before running the demo in production, ' +
        'or STORY_DEMO_OPEN_EDITING=1 to let anyone edit on your own machine.',
    );
  }
  return Object.assign(createOpenAuth(), { open: true });
}

/** Publishes the seed stories and saves the draft-only one, once, on an empty store. */
async function seedStore(store: DocumentStore): Promise<void> {
  if ((await store.list()).length > 0) return;
  const source = { kind: 'seed', ref: 'content/seed.ts' };
  for (const content of seed.published) {
    const document = await store.saveDraft({ slug: content.slug, content, parentDocumentId: null, source });
    await store.publish({ slug: content.slug, documentId: document.id, expectedPublishedDocumentId: null, publishedBy: 'seed' });
  }
  for (const content of seed.drafts) {
    await store.saveDraft({ slug: content.slug, content, parentDocumentId: null, source });
  }
}

export interface DemoBackend {
  story: StoryHandlers;
  store: DocumentStore;
  /** True when anyone can edit (no passcode set). */
  openEditing: boolean;
}

async function createBackend(): Promise<DemoBackend> {
  const [store, media] = await Promise.all([createStore(), createMedia()]);
  await seedStore(store);
  const auth = createAuth();
  const story = createStoryHandlers({
    store,
    media,
    auth,
    basePath: BASE_PATH,
    mediaPolicy: createMediaPolicy({ basePath: `${BASE_PATH}/media` }),
    customBlocks: CUSTOM_BLOCK_NAMES,
    uploadVisibility: 'public',
    otherAddresses: () => ['admin', 'api', 'samples'],
  });
  return { story, store, openEditing: auth.open };
}

// Kept on globalThis so the in-memory store survives hot reloads in `next dev`.
const globalKey = Symbol.for('story-demo.backend');
type Holder = { [globalKey]?: Promise<DemoBackend> };

export function backend(): Promise<DemoBackend> {
  const holder = globalThis as Holder;
  holder[globalKey] ??= createBackend().catch((error) => {
    delete holder[globalKey];
    throw error;
  });
  return holder[globalKey]!;
}
