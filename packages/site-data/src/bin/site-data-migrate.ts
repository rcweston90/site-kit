#!/usr/bin/env node
/**
 * site-data-migrate: apply the shipped modules' pending Postgres migrations.
 *
 *   SITE_KIT_DATABASE_URL=postgres://... site-data-migrate            apply what's pending
 *   SITE_KIT_DATABASE_URL=postgres://... site-data-migrate --dry-run  list it, change nothing
 *   site-data-migrate --modules site-resources,work-order             only these modules
 */

import { migrate } from '../migrate.js';
import { SITE_DATA_MODULES } from '../registry.js';

const HELP = `Usage: site-data-migrate [--dry-run] [--modules a,b]

Applies the site-data modules' pending migrations to the database in
SITE_KIT_DATABASE_URL (or DATABASE_URL), in one transaction, and records them
in site_data_migrations.

  --dry-run        List the pending migrations without applying them.
  --modules a,b    Only these modules (default: every shipped module).
  --help           Show this help.`;

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const dryRun = argv.includes('--dry-run');
  const at = argv.indexOf('--modules');
  const named = at >= 0 ? (argv[at + 1] ?? '').split(',').filter(Boolean) : null;
  const unknown = argv.filter((arg, index) => arg !== '--dry-run' && arg !== '--modules' && !(at >= 0 && index === at + 1));
  if (unknown.length > 0 || (named && named.length === 0)) {
    console.error(`Unknown option: ${unknown.join(' ') || '--modules needs a list'}\n\n${HELP}`);
    return 2;
  }
  const modules = named ? SITE_DATA_MODULES.filter((module) => named.includes(module.id)) : SITE_DATA_MODULES;
  const missing = named?.filter((id) => !SITE_DATA_MODULES.some((module) => module.id === id)) ?? [];
  if (missing.length > 0) {
    console.error(`No module called ${missing.join(', ')}. Shipped: ${SITE_DATA_MODULES.map((module) => module.id).join(', ')}.`);
    return 2;
  }
  const url = process.env.SITE_KIT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Set SITE_KIT_DATABASE_URL to the Postgres database to migrate.');
    return 2;
  }
  let pg: typeof import('pg').default;
  try {
    pg = (await import('pg')).default;
  } catch {
    console.error('site-data-migrate needs the "pg" package. Install it next to @rcweston/site-data.');
    return 2;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await migrate({ client: { query: (text, params) => client.query(text, params) }, modules, dryRun });
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
