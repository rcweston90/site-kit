/**
 * showreel: the reel the site plays, ported from Admin → Showreel.
 *
 *   GET    /showreel   ShowreelResponse: the saved reel (or null), the default and how it plays
 *   PUT    /showreel   { url, expectedVersion? } → ShowreelResponse (422 for a link that can't play)
 *   DELETE /showreel   back to the default → ShowreelResponse
 *
 * A video is uploaded through the site's media route (story-server's
 * `/media`), so it is an ordinary MediaStore file; Save stores its address.
 * A save built on an older version answers 409 with what's there now.
 */

import { defineModule } from '../../module.js';
import { expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import { configureShowreel, linksFor, normalizeReelUrl, type ShowreelConfig, type ShowreelLinks, type ShowreelResponse } from './model.js';

export * from './model.js';

export type ShowreelStore = VersionedTable<string>;

export interface ShowreelReads {
  /** How the reel plays: the saved one, or the default; null when there is neither. */
  links(): Promise<ShowreelLinks | null>;
}

const REEL = 'showreel';

function responseOf(row: Versioned<string> | null, config: ShowreelConfig): ShowreelResponse {
  const url = row?.value ?? config.defaultReel;
  const poster = row ? null : config.defaultPoster;
  return {
    setting: row ? { url: row.value, updatedAt: row.updatedAt ?? new Date(0).toISOString() } : null,
    defaultUrl: config.defaultReel,
    links: url ? linksFor(url, { poster, embedHost: config.embedHost }) : null,
    version: row?.version ?? 0,
    path: config.path,
  };
}

export const showreel = defineModule({
  id: 'showreel',
  title: 'Showreel',
  migrationRange: [1900, 1999],
  migrations: MIGRATIONS,
  configure: configureShowreel,
  createMemoryStore: (): ShowreelStore => createMemoryTable<string>(),
  createPostgresStore: (sql): ShowreelStore =>
    createPostgresTable<string>(sql, {
      table: 'site_showreel',
      keyColumn: 'reel',
      columns: ['url'],
      toRow: (url) => [url],
      fromRow: (row) => String(row.url),
    }),
  handlers: ({ store, config, revalidate }) => [
    {
      method: 'GET',
      path: '',
      handle: async () => json(responseOf(await store.get(REEL), config)),
    },
    {
      method: 'PUT',
      path: '',
      handle: async ({ request }) => {
        const body = await readBody(request);
        const result = normalizeReelUrl(typeof body.url === 'string' ? body.url : '');
        if ('error' in result) return json({ error: result.error, code: 'INVALID' }, 422);
        const saved = await store.set(REEL, result.url, expectedVersionOf(body));
        await revalidate([config.path]);
        return json(responseOf(saved, config));
      },
    },
    {
      method: 'DELETE',
      path: '',
      handle: async () => {
        await store.remove(REEL);
        await revalidate([config.path]);
        return json(responseOf(null, config));
      },
    },
  ],
  publicReads: (store, config: ShowreelConfig): ShowreelReads => ({
    links: async () => responseOf(await store.get(REEL), config).links,
  }),
});
