/**
 * Applies pending migrations for the stories (story-server) and the site
 * settings (site-data) to the database `lib/config.ts` picks: the Postgres at
 * SITE_KIT_DATABASE_URL, or the embedded one in .data/.
 *
 *   pnpm db:migrate             apply
 *   pnpm db:migrate --dry-run   list what's pending
 *
 * Both runners take a lock and skip what has run, so this is safe to repeat
 * and safe beside a running server on a hosted Postgres. Stop the dev server
 * first when the database is the embedded one: only one process may open it.
 */
import { SITE_DATA_MODULES, createSiteData } from '@rcweston/site-data';
import { migrate } from '@rcweston/story-server/postgres';
import { readConfig } from '../lib/config';
import { describeStorage, openDatabase } from '../lib/storage';

// Next reads these files itself; this script runs outside it. Earlier files win, as in Next.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

const dryRun = process.argv.includes('--dry-run');
const config = readConfig();
if (config.storage.kind === 'memory') {
  console.error('SITE_KIT_STORAGE=memory has no database to migrate.');
  process.exit(1);
}
console.log(`site-kit: ${describeStorage(config.storage, config.media)}`);

const database = await openDatabase(config.storage);
if (!database) throw new Error('No database configured.');
const report = (label: string, result: { applied: string[]; pending: string[] }) => {
  const names = dryRun ? result.pending : result.applied;
  console.log(`${label}: ${names.length ? `${dryRun ? 'pending' : 'applied'} ${names.join(', ')}` : 'up to date'}`);
};
try {
  report('stories', await migrate({ client: database.sql, dryRun }));
  report('site settings', await createSiteData({ modules: SITE_DATA_MODULES, sql: database.sql }).migrate({ dryRun }));
} finally {
  await database.close();
}
