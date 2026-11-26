/**
 * Explicit, recorded migrations for every enabled module. Pending files run
 * in one transaction and are written to `site_data_migrations` with their
 * checksum, so running again is a no-op and a migration edited after it ran
 * is caught instead of skipped. Each module owns a range of numbers, so two
 * modules can't both write `1001_…`.
 */

import { sha256Hex } from '@rcweston/story-core';
import { createSqlRunner, execScript, type SqlClient, type SqlPool } from '@rcweston/story-server/postgres';
import type { SiteDataModule } from './module.js';

export interface Migration {
  /** The file name, e.g. `1100_site_work_order.sql`. Applied in name order. */
  name: string;
  sql: string;
}

export interface MigrateOptions {
  client: SqlPool;
  modules: readonly SiteDataModule[];
  /** Your own extra migrations, numbered 9000 and up. */
  extra?: readonly Migration[];
  dryRun?: boolean;
}

export interface MigrateResult {
  applied: string[];
  pending: string[];
  alreadyApplied: string[];
}

const NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
export const HOST_MIGRATION_RANGE = [9000, 9999] as const;

/**
 * Who owns which migration numbers. A new module takes its row from here
 * (MODULES.md); the numbers stay reserved whether or not the module ships yet.
 */
export const MIGRATION_RANGES = {
  'site-resources': [1000, 1099],
  'work-order': [1100, 1199],
  'story-placement': [1200, 1299],
  'media-library': [1300, 1399],
  blog: [1400, 1499],
  notes: [1500, 1599],
  links: [1600, 1699],
  shots: [1700, 1799],
  tracks: [1800, 1899],
  showreel: [1900, 1999],
  resume: [2000, 2099],
  home: [2100, 2199],
  community: [2200, 2299],
  people: [2300, 2399],
  companies: [2400, 2499],
  projects: [2500, 2599],
  seo: [2600, 2699],
  lab: [2700, 2799],
  appearance: [2800, 2899],
  analytics: [2900, 2999],
} as const satisfies Record<string, readonly [number, number]>;

/** Every migration the modules bring, checked against their ranges. */
export function collectMigrations(modules: readonly SiteDataModule[], extra: readonly Migration[] = []): Migration[] {
  const ids = new Set<string>();
  const owners: { id: string; range: readonly [number, number] }[] = [];
  const all: Migration[] = [];
  const claim = (owner: string, range: readonly [number, number], migration: Migration) => {
    const match = NAME.exec(migration.name);
    if (!match) throw new Error(`${owner}: ${migration.name} isn't named NNNN_words.sql.`);
    const number = Number(match[1]);
    if (number < range[0] || number > range[1]) {
      throw new Error(`${owner}: ${migration.name} is outside its range ${range[0]}–${range[1]}.`);
    }
    all.push({ name: migration.name, sql: migration.sql });
  };
  for (const module of modules) {
    if (ids.has(module.id)) throw new Error(`Two modules are called ${module.id}.`);
    ids.add(module.id);
    const [low, high] = module.migrationRange;
    const overlap = owners.find((owner) => low <= owner.range[1] && owner.range[0] <= high);
    if (overlap) throw new Error(`${module.id} and ${overlap.id} claim overlapping migration ranges.`);
    owners.push({ id: module.id, range: module.migrationRange });
    for (const migration of module.migrations) claim(module.id, module.migrationRange, migration);
  }
  for (const migration of extra) claim('your migrations', HOST_MIGRATION_RANGE, migration);
  const names = new Set<string>();
  for (const migration of all) {
    if (names.has(migration.name)) throw new Error(`Two migrations are named ${migration.name}.`);
    names.add(migration.name);
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

const checksumOf = (migration: Migration) => sha256Hex(migration.sql);

async function appliedMigrations(client: SqlClient): Promise<Map<string, string>> {
  const table = await client.query(`SELECT to_regclass('site_data_migrations')::text AS name`);
  if (!table.rows[0]?.name) return new Map();
  const { rows } = await client.query('SELECT name, checksum FROM site_data_migrations ORDER BY name');
  return new Map(rows.map((row) => [row.name as string, row.checksum as string]));
}

function plan(migrations: Migration[], applied: Map<string, string>): Migration[] {
  for (const migration of migrations) {
    const recorded = applied.get(migration.name);
    if (recorded && recorded !== checksumOf(migration)) {
      throw new Error(`${migration.name} changed after it was applied. Put the change in a new migration instead.`);
    }
  }
  return migrations.filter((migration) => !applied.has(migration.name));
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const migrations = collectMigrations(options.modules, options.extra);
  const sql = createSqlRunner(options.client);

  if (options.dryRun) {
    const applied = await sql.read(appliedMigrations);
    return { applied: [], pending: plan(migrations, applied).map((migration) => migration.name), alreadyApplied: [...applied.keys()] };
  }

  return sql.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('site-data'), hashtext('migrations'))`);
    await tx.query(`
      CREATE TABLE IF NOT EXISTS site_data_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const applied = await appliedMigrations(tx);
    const pending = plan(migrations, applied);
    for (const migration of pending) {
      try {
        await execScript(tx, migration.sql);
      } catch (error) {
        throw new Error(`${migration.name} failed, so nothing was applied: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      await tx.query('INSERT INTO site_data_migrations (name, checksum) VALUES ($1, $2)', [migration.name, checksumOf(migration)]);
    }
    return { applied: pending.map((migration) => migration.name), pending: [], alreadyApplied: [...applied.keys()] };
  }, 'READ COMMITTED');
}
