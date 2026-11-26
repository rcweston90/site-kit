import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Every setting the site reads, in one place. Each one is an environment
 * variable starting `SITE_KIT_`; `env.example` lists them with notes.
 *
 * With nothing set, the site keeps its stories in an embedded Postgres
 * (PGlite) and its uploads on disk, both under `.data/`, so they last across
 * restarts. Set `SITE_KIT_DATABASE_URL` for a hosted Postgres and the
 * `SITE_KIT_S3_*` variables for a bucket.
 */

export type StorageConfig =
  | { kind: 'memory' }
  | { kind: 'pglite'; dir: string }
  | { kind: 'postgres'; url: string; poolSize?: number };

export type MediaConfig =
  | { kind: 'memory' }
  | { kind: 'disk'; dir: string }
  | { kind: 's3'; endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string };

export interface SiteKitConfig {
  storage: StorageConfig;
  media: MediaConfig;
  /** The folder for the embedded database and local uploads. */
  dataDir: string;
  /** Run pending migrations on first use. They take a lock and skip what has run, so it's safe with several instances. */
  autoMigrate: boolean;
  /** Write the sample stories into an empty store. */
  seed: boolean;
  auth: { passcode?: string; secret?: string };
  /** Where the site is served from, for absolute links and metadata. */
  siteUrl: URL;
  production: boolean;
}

type Env = Record<string, string | undefined>;

const S3_KEYS = ['SITE_KIT_S3_ENDPOINT', 'SITE_KIT_S3_BUCKET', 'SITE_KIT_S3_ACCESS_KEY_ID', 'SITE_KIT_S3_SECRET_ACCESS_KEY'] as const;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const value = (env: Env, key: string) => env[key]?.trim() || undefined;

function flag(env: Env, key: string, fallback: boolean): boolean {
  const raw = value(env, key)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new ConfigError(`${key} should be true or false, not "${env[key]}".`);
}

export function readConfig(env: Env = process.env, cwd = process.cwd()): SiteKitConfig {
  const at = (path: string) => (isAbsolute(path) ? path : resolve(cwd, path));
  const dataDir = at(value(env, 'SITE_KIT_DATA_DIR') ?? '.data');

  const mode = value(env, 'SITE_KIT_STORAGE')?.toLowerCase();
  if (mode !== undefined && mode !== 'memory' && mode !== 'auto') {
    throw new ConfigError(`SITE_KIT_STORAGE should be "memory" or left unset, not "${env.SITE_KIT_STORAGE}".`);
  }
  const memory = mode === 'memory';

  const url = value(env, 'SITE_KIT_DATABASE_URL');
  const rawPool = value(env, 'SITE_KIT_DATABASE_POOL_SIZE');
  const poolSize = rawPool === undefined ? undefined : Number(rawPool);
  if (poolSize !== undefined && !(Number.isInteger(poolSize) && poolSize > 0)) {
    throw new ConfigError(`SITE_KIT_DATABASE_POOL_SIZE should be a whole number above 0, not "${rawPool}".`);
  }
  const storage: StorageConfig = memory
    ? { kind: 'memory' }
    : url ? { kind: 'postgres', url, ...(poolSize ? { poolSize } : {}) } : { kind: 'pglite', dir: join(dataDir, 'pglite') };

  const s3Set = S3_KEYS.filter((key) => value(env, key));
  if (s3Set.length > 0 && s3Set.length < S3_KEYS.length) {
    const missing = S3_KEYS.filter((key) => !value(env, key));
    throw new ConfigError(`Media on S3 needs ${missing.join(', ')} as well as ${s3Set.join(', ')}.`);
  }
  const media: MediaConfig = memory
    ? { kind: 'memory' }
    : s3Set.length
      ? {
          kind: 's3',
          endpoint: value(env, 'SITE_KIT_S3_ENDPOINT')!,
          bucket: value(env, 'SITE_KIT_S3_BUCKET')!,
          accessKeyId: value(env, 'SITE_KIT_S3_ACCESS_KEY_ID')!,
          secretAccessKey: value(env, 'SITE_KIT_S3_SECRET_ACCESS_KEY')!,
          region: value(env, 'SITE_KIT_S3_REGION'),
        }
      : { kind: 'disk', dir: at(value(env, 'SITE_KIT_MEDIA_DIR') ?? join(dataDir, 'media')) };

  const rawSiteUrl = value(env, 'SITE_KIT_SITE_URL') ?? 'http://localhost:3000';
  let siteUrl: URL;
  try {
    siteUrl = new URL(rawSiteUrl);
  } catch {
    throw new ConfigError(`SITE_KIT_SITE_URL should be a full address like https://example.com, not "${rawSiteUrl}".`);
  }

  return {
    storage,
    media,
    dataDir,
    autoMigrate: flag(env, 'SITE_KIT_AUTO_MIGRATE', true),
    seed: flag(env, 'SITE_KIT_SEED', true),
    auth: { passcode: value(env, 'SITE_KIT_ADMIN_PASSCODE'), secret: value(env, 'SITE_KIT_SESSION_SECRET') },
    siteUrl,
    production: env.NODE_ENV === 'production',
  };
}

/** Hosts whose disk is read-only or wiped between requests. */
const SERVERLESS_MARKERS = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'NETLIFY', 'K_SERVICE', 'FUNCTION_TARGET'] as const;

export interface LocalDisk {
  /** The folder can be written to. */
  writable: boolean;
  /** The host is known to throw its disk away (a serverless function). */
  ephemeral: boolean;
}

/** Whether local storage under `dir` will hold what's written to it. */
export function probeLocalDisk(dir: string, env: Env = process.env): LocalDisk {
  const ephemeral = SERVERLESS_MARKERS.some((key) => value(env, key));
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    const probe = join(dir, `.write-test-${process.pid}`);
    writeFileSync(probe, '');
    rmSync(probe, { force: true });
    return { writable: true, ephemeral };
  } catch {
    return { writable: false, ephemeral };
  }
}

export interface StoragePlan {
  storage: StorageConfig;
  media: MediaConfig;
  /** Plain sentences for the start-up log and the admin. Empty when storage will last. */
  warnings: string[];
}

/**
 * What the site will actually use. Local storage on a disk that can't be
 * written falls back to memory, and anything that won't last says so.
 */
export function planStorage(config: SiteKitConfig, env: Env = process.env): StoragePlan {
  const warnings: string[] = [];
  let { storage, media } = config;
  const usesLocal = storage.kind === 'pglite' || media.kind === 'disk';
  const disk = usesLocal ? probeLocalDisk(config.dataDir, env) : null;

  if (disk && !disk.writable) {
    if (storage.kind === 'pglite') storage = { kind: 'memory' };
    if (media.kind === 'disk') media = { kind: 'memory' };
    warnings.push(
      `This server can't write to ${config.dataDir}, so stories and uploads are kept in memory and lost when it restarts. ` +
        'Set SITE_KIT_DATABASE_URL to a Postgres database and the SITE_KIT_S3_* variables to a bucket.',
    );
  } else if (disk?.ephemeral) {
    const parts = [storage.kind === 'pglite' ? 'stories (SITE_KIT_DATABASE_URL)' : null, media.kind === 'disk' ? 'uploads (SITE_KIT_S3_*)' : null].filter(Boolean);
    warnings.push(
      `This host throws its disk away between deploys and instances, so ${parts.join(' and ')} saved on it won't last. ` +
        'Point them at a hosted database and bucket.',
    );
  }
  if (config.storage.kind === 'memory') {
    warnings.push('SITE_KIT_STORAGE=memory: stories and uploads are lost when the server restarts.');
  }
  return { storage, media, warnings };
}
