import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { loadMigrations, migrate } from '../src/postgres/index.ts';

describe('migrations', () => {
  it('embeds exactly the .sql files in the migrations folder', async () => {
    const embedded = await loadMigrations();
    const fromFolder = await loadMigrations(new URL('../migrations/', import.meta.url));
    assert.deepEqual(embedded, fromFolder, 'Run `pnpm build` (scripts/embed-migrations.mjs) after changing a migration.');
  });

  it('ships plain .sql files in order, with only generic table names', async () => {
    const migrations = await loadMigrations();
    assert.deepEqual(migrations.map((migration) => migration.name), [
      '0001_story_documents.sql',
      '0002_story_slug_redirects.sql',
      '0003_story_rate_limits.sql',
    ]);
    for (const migration of migrations) {
      assert.doesNotMatch(migration.sql, /\b(BEGIN|COMMIT)\b/, `${migration.name} must not manage its own transaction`);
    }
  });

  it('lists pending migrations on a dry run without creating anything', async () => {
    const db = new PGlite();
    try {
      const result = await migrate({ client: db, dryRun: true });
      assert.equal(result.pending.length, 3);
      assert.deepEqual(result.applied, []);
      const { rows } = await db.query<{ name: string | null }>(`SELECT to_regclass('story_migrations')::text AS name`);
      assert.equal(rows[0].name, null);
    } finally {
      await db.close();
    }
  });

  it('applies everything once, and a second run is a no-op', async () => {
    const db = new PGlite();
    try {
      const first = await migrate({ client: db });
      assert.deepEqual(first.applied, ['0001_story_documents.sql', '0002_story_slug_redirects.sql', '0003_story_rate_limits.sql']);
      const tables = await db.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      assert.deepEqual(tables.rows.map((row) => row.name), ['story_documents', 'story_migrations', 'story_publications', 'story_rate_limits', 'story_slug_redirects']);

      const second = await migrate({ client: db });
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.alreadyApplied, first.applied);
      const recorded = await db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM story_migrations');
      assert.equal(recorded.rows[0].count, 3);
      assert.deepEqual((await migrate({ client: db, dryRun: true })).pending, []);
    } finally {
      await db.close();
    }
  });

  it('rolls everything back when one migration fails, and catches an edited migration', async () => {
    const db = new PGlite();
    try {
      await assert.rejects(
        migrate({ client: db, migrations: [
          { name: '0001_ok.sql', sql: 'CREATE TABLE first_table (id INT);' },
          { name: '0002_broken.sql', sql: 'CREATE TABLE oops (' },
        ] }),
        /0002_broken\.sql failed, so nothing was applied/,
      );
      const { rows } = await db.query<{ name: string | null }>(`SELECT to_regclass('first_table')::text AS name`);
      assert.equal(rows[0].name, null);

      await migrate({ client: db, migrations: [{ name: '0001_ok.sql', sql: 'CREATE TABLE first_table (id INT);' }] });
      await assert.rejects(
        migrate({ client: db, migrations: [{ name: '0001_ok.sql', sql: 'CREATE TABLE first_table (id BIGINT);' }] }),
        /changed after it was applied/,
      );
    } finally {
      await db.close();
    }
  });
});
