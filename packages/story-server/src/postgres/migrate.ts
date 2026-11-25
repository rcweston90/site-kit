/**
 * Explicit, recorded migrations. Pending files run in one transaction and are
 * written to `story_migrations` with their checksum, so running again is a
 * no-op and a migration edited after it ran is caught instead of skipped.
 */

import { sha256Hex } from '@rcweston/story-core';
import { createSqlRunner, execScript, type SqlClient, type SqlPool } from './client.js';
import { BUNDLED_MIGRATIONS } from './migrations.generated.js';

export interface Migration {
  /** The file name, e.g. `0001_story_documents.sql`. Applied in name order. */
  name: string;
  sql: string;
}

export interface MigrateOptions {
  client: SqlPool;
  /** Default: this package's own migrations, embedded at build time from its `migrations` folder. */
  migrations?: Migration[];
  /** List what would run without running it. */
  dryRun?: boolean;
}

export interface MigrateResult {
  /** Applied by this call (empty on a dry run). */
  applied: string[];
  /** Waiting to run (on a dry run), or empty once applied. */
  pending: string[];
  /** Applied before this call. */
  alreadyApplied: string[];
}

/**
 * Migrations from a folder of `.sql` files (Node only), or this package's own
 * when no folder is given. Reading a folder is for your own extra migrations;
 * the package's are embedded, so `migrate()` needs no file access.
 */
export async function loadMigrations(directory?: string | URL): Promise<Migration[]> {
  if (directory === undefined) return BUNDLED_MIGRATIONS.map((migration) => ({ ...migration }));
  const { readdir, readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const path = directory instanceof URL ? fileURLToPath(directory) : directory;
  const names = (await readdir(path)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(join(path, name), 'utf8') })));
}

const checksumOf = (migration: Migration) => sha256Hex(migration.sql);

async function appliedMigrations(client: SqlClient): Promise<Map<string, string>> {
  const table = await client.query(`SELECT to_regclass('story_migrations')::text AS name`);
  if (!table.rows[0]?.name) return new Map();
  const { rows } = await client.query('SELECT name, checksum FROM story_migrations ORDER BY name');
  return new Map(rows.map((row) => [row.name as string, row.checksum as string]));
}

function plan(migrations: Migration[], applied: Map<string, string>): Migration[] {
  const names = new Set<string>();
  for (const migration of migrations) {
    if (names.has(migration.name)) throw new Error(`Two migrations are named ${migration.name}.`);
    names.add(migration.name);
    const recorded = applied.get(migration.name);
    if (recorded && recorded !== checksumOf(migration)) {
      throw new Error(`${migration.name} changed after it was applied. Put the change in a new migration instead.`);
    }
  }
  return [...migrations].sort((a, b) => a.name.localeCompare(b.name)).filter((migration) => !applied.has(migration.name));
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const migrations = options.migrations ?? (await loadMigrations());
  const sql = createSqlRunner(options.client);

  if (options.dryRun) {
    const applied = await sql.read(appliedMigrations);
    return { applied: [], pending: plan(migrations, applied).map((migration) => migration.name), alreadyApplied: [...applied.keys()] };
  }

  return sql.transaction(async (tx) => {
    // Two deploys migrating at once: the second waits, then finds nothing to do.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext('story-server'), hashtext('migrations'))`);
    await tx.query(`
      CREATE TABLE IF NOT EXISTS story_migrations (
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
      await tx.query('INSERT INTO story_migrations (name, checksum) VALUES ($1, $2)', [migration.name, checksumOf(migration)]);
    }
    return { applied: pending.map((migration) => migration.name), pending: [], alreadyApplied: [...applied.keys()] };
  }, 'READ COMMITTED');
}
