#!/usr/bin/env node
/**
 * story-migrate: apply this package's pending Postgres migrations.
 *
 *   DATABASE_URL=postgres://... story-migrate            apply what's pending
 *   DATABASE_URL=postgres://... story-migrate --dry-run  list it, change nothing
 */

import { migrate } from '../postgres/migrate.js';

const HELP = `Usage: story-migrate [--dry-run]

Applies the story tables' pending migrations to the database in DATABASE_URL,
in one transaction, and records them in story_migrations.

  --dry-run   List the pending migrations without applying them.
  --help      Show this help.`;

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const unknown = argv.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(' ')}\n\n${HELP}`);
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL to the Postgres database to migrate.');
    return 2;
  }
  let pg: typeof import('pg').default;
  try {
    pg = (await import('pg')).default;
  } catch {
    console.error('story-migrate needs the "pg" package. Install it next to @rcweston/story-server.');
    return 2;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const dryRun = argv.includes('--dry-run');
    // One connection: hand over only `query`, so the migration's transaction stays on it.
    const result = await migrate({ client: { query: (text, params) => client.query(text, params) }, dryRun });
    const list = dryRun ? result.pending : result.applied;
    if (list.length === 0) console.log('Nothing to apply. The database is up to date.');
    else console.log(`${dryRun ? 'Would apply' : 'Applied'}:\n${list.map((name) => `  ${name}`).join('\n')}`);
    return 0;
  } finally {
    await client.end();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
