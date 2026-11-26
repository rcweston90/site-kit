/**
 * community: every word and link on the community page, ported from
 * Admin → Community.
 *
 *   GET    /community   CommunityResponse: the page, the shipped page, whether it's edited
 *   PUT    /community   { content, expectedVersion? } → CommunityResponse
 *   DELETE /community   back to the shipped page → CommunityResponse
 *
 * The page is small and always saved as a whole, so it is one document. A
 * save built on an older version answers 409 with what's there now.
 */

import { parseJson } from '@rcweston/story-server/postgres';
import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  configureCommunity,
  normalizeCommunity,
  visibleCommunity,
  unsafeCommunityLinks,
  type CommunityConfig,
  type CommunityContent,
  type CommunityResponse,
} from './model.js';

export * from './model.js';

export type CommunityStore = VersionedTable<CommunityContent>;

export interface CommunityReads {
  /** The page as visitors see it: the saved document, or the shipped one, hidden rows left off. */
  content(): Promise<CommunityContent>;
}

const PAGE = 'community';

const responseOf = (row: Versioned<CommunityContent> | null, config: CommunityConfig): CommunityResponse => ({
  content: row ? normalizeCommunity(row.value, config.defaults) : config.defaults,
  defaults: config.defaults,
  customized: row !== null,
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt ?? null,
  path: config.path,
});

export const community = defineModule({
  id: 'community',
  title: 'Community',
  migrationRange: [2200, 2299],
  migrations: MIGRATIONS,
  configure: configureCommunity,
  createMemoryStore: (): CommunityStore => createMemoryTable<CommunityContent>(),
  createPostgresStore: (sql): CommunityStore =>
    createPostgresTable<CommunityContent>(sql, {
      table: 'site_community',
      keyColumn: 'page',
      columns: ['content'],
      toRow: (content) => [JSON.stringify(content)],
      fromRow: (row) => parseJson<CommunityContent>(row.content),
    }),
  handlers: ({ store, config, revalidate }) => [
    {
      method: 'GET',
      path: '',
      handle: async () => json(responseOf(await store.get(PAGE), config)),
    },
    {
      method: 'PUT',
      path: '',
      handle: async ({ request }) => {
        const body = await readBody(request);
        // Normalising trims everything and drops rows missing a title or link;
        // the response echoes what was stored so the form can mirror it.
        const content = normalizeCommunity(body.content, config.defaults);
        const unsafe = unsafeCommunityLinks(content);
        if (unsafe.length) throw new InvalidInputError(`Links must start with https://, mailto:, tel: or /. Check: ${unsafe.join(', ')}`);
        const saved = await store.set(PAGE, content, expectedVersionOf(body));
        await revalidate([config.path]);
        return json(responseOf(saved, config));
      },
    },
    {
      method: 'DELETE',
      path: '',
      handle: async () => {
        await store.remove(PAGE);
        await revalidate([config.path]);
        return json(responseOf(null, config));
      },
    },
  ],
  publicReads: (store, config: CommunityConfig): CommunityReads => ({
    content: async () => visibleCommunity(responseOf(await store.get(PAGE), config).content),
  }),
});
