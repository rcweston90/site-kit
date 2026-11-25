import { after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createMemoryDocumentStore } from '../src/memory/index.ts';
import { createPostgresDocumentStore, migrate } from '../src/postgres/index.ts';
import { documentStoreContract } from './store-contract.ts';

// Memory: reads fail once the test flips the switch.
let memoryBroken = false;
documentStoreContract('memory', {
  async create() {
    memoryBroken = false;
    return createMemoryDocumentStore({
      beforeRead: () => {
        if (memoryBroken) throw new Error('The memory store was told to fail.');
      },
    });
  },
  async breakReads() {
    memoryBroken = true;
  },
});

// Postgres: one PGlite database, migrated once and emptied before each test.
const db = new PGlite();
const ready = migrate({ client: db });
after(() => db.close());

documentStoreContract('postgres (PGlite)', {
  async create() {
    await ready;
    const broken = await db.query<{ name: string | null }>(`SELECT to_regclass('broken_publications')::text AS name`);
    if (broken.rows[0]?.name) await db.exec('ALTER TABLE broken_publications RENAME TO story_publications');
    await db.exec('TRUNCATE story_publications, story_slug_redirects, story_documents');
    return createPostgresDocumentStore({ pool: db });
  },
  async breakReads() {
    // Put back by the next create().
    await db.exec('ALTER TABLE story_publications RENAME TO broken_publications');
  },
});
