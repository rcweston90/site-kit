import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DocumentStore, MediaStore } from '@rcweston/story-core';
import type { SqlPool } from '@rcweston/story-server/postgres';
import type { MediaConfig, StorageConfig } from './config';

/**
 * Opens what `planStorage` chose. Nothing heavy is imported until it's
 * needed, so the memory setup never loads Postgres or PGlite.
 */

export interface Database {
  sql: SqlPool;
  kind: 'pglite' | 'postgres';
  close(): Promise<void>;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * PGlite keeps one database in one folder for one process. Two servers on the
 * same folder would damage it, so the second one stops with a clear message.
 */
function claimFolder(dir: string): () => void {
  // Beside the folder, not in it: PGlite only creates a database in an empty folder.
  mkdirSync(dirname(dir), { recursive: true });
  const lock = `${dir}.pid`;
  try {
    const owner = Number(readFileSync(lock, 'utf8'));
    if (owner && owner !== process.pid && alive(owner)) {
      throw new Error(
        `Another server (process ${owner}) is using the database in ${dir}. Stop it first, ` +
          'or give this one its own folder with SITE_KIT_DATA_DIR.',
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  writeFileSync(lock, String(process.pid));
  const release = () => rmSync(lock, { force: true });
  process.once('exit', release);
  return release;
}

export async function openDatabase(storage: StorageConfig): Promise<Database | null> {
  if (storage.kind === 'memory') return null;
  if (storage.kind === 'postgres') {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: storage.url, ...(storage.poolSize ? { max: storage.poolSize } : {}) });
    return { sql: pool, kind: 'postgres', close: () => pool.end() };
  }
  const release = claimFolder(storage.dir);
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(storage.dir);
  return {
    sql: db,
    kind: 'pglite',
    close: async () => {
      await db.close();
      release();
    },
  };
}

export async function openDocuments(database: Database | null, { migrate }: { migrate: boolean }): Promise<DocumentStore> {
  if (!database) {
    const { createMemoryDocumentStore } = await import('@rcweston/story-server/memory');
    return createMemoryDocumentStore();
  }
  const postgres = await import('@rcweston/story-server/postgres');
  if (migrate) await postgres.migrate({ client: database.sql });
  return postgres.createPostgresDocumentStore({ pool: database.sql });
}

export async function openMedia(media: MediaConfig): Promise<MediaStore> {
  if (media.kind === 's3') {
    const { createS3MediaStore } = await import('@rcweston/story-server/s3');
    const { kind: _kind, ...options } = media;
    return createS3MediaStore(options);
  }
  if (media.kind === 'disk') {
    const { createFsMediaStore } = await import('@rcweston/story-server/fs');
    return withSeedSvgTypes(createFsMediaStore({ dir: media.dir }));
  }
  const { createMemoryMediaStore } = await import('@rcweston/story-server/memory');
  return createMemoryMediaStore();
}

/**
 * The disk store types files by extension from the formats uploads may use,
 * which leave SVG out. The seed's drawn covers are SVG, so name their type
 * (they're served under the media route's sandboxing policy like any file).
 */
function withSeedSvgTypes(store: MediaStore): MediaStore {
  const svg = (key: string) => key.toLowerCase().endsWith('.svg');
  return {
    ...store,
    async head(key) {
      const head = await store.head(key);
      return head && svg(key) ? { ...head, contentType: 'image/svg+xml' } : head;
    },
    async get(key, range) {
      const object = await store.get(key, range);
      return object && svg(key) ? { ...object, contentType: 'image/svg+xml' } : object;
    },
  };
}

/** One line for the start-up log: where things are kept. */
export function describeStorage(storage: StorageConfig, media: MediaConfig): string {
  const stories = storage.kind === 'postgres'
    ? `Postgres at ${redact(storage.url)}`
    : storage.kind === 'pglite' ? `embedded Postgres in ${storage.dir}` : 'memory';
  const uploads = media.kind === 's3' ? `bucket ${media.bucket} at ${media.endpoint}` : media.kind === 'disk' ? media.dir : 'memory';
  return `stories: ${stories}; uploads: ${uploads}`;
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return 'the configured address';
  }
}
