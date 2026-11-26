/**
 * work-order: the hand-set order of story lists.
 *
 *   GET /work-order?list=stories   { order: WorkOrderRecord }
 *   PUT /work-order                { list, slugs, expectedVersion? } → { order }
 *
 * The admin always sends the whole list. A save built on an older version
 * answers 409 with the order that's there now.
 */

import { parseJson } from '@rcweston/story-server/postgres';
import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import { configureWorkOrder, parseWorkOrderSlugs, resolveWorkOrder, sortByWorkOrder, type SlugRedirectLike, type WorkOrderConfig, type WorkOrderRecord } from './model.js';

export * from './model.js';

export type WorkOrderStore = VersionedTable<string[]>;

export interface WorkOrderReads {
  /** The saved order of `list` under current addresses (empty before anyone arranges it). */
  order(list?: string): Promise<string[]>;
  /** `items` in the saved order of `list`; anything unnamed follows in arrival order. */
  sort<T>(items: readonly T[], keyOf: (item: T) => string, list?: string): Promise<T[]>;
}

const recordOf = (list: string, row: Versioned<string[]> | null): WorkOrderRecord => ({
  list,
  slugs: row?.value ?? [],
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt ?? null,
});

export const workOrder = defineModule({
  id: 'work-order',
  title: 'Story order',
  migrationRange: [1100, 1199],
  migrations: MIGRATIONS,
  configure: configureWorkOrder,
  createMemoryStore: (): WorkOrderStore => createMemoryTable<string[]>(),
  createPostgresStore: (sql): WorkOrderStore =>
    createPostgresTable<string[]>(sql, {
      table: 'site_work_order',
      keyColumn: 'list',
      columns: ['slugs'],
      toRow: (slugs) => [JSON.stringify(slugs)],
      fromRow: (row) => parseJson<string[]>(row.slugs),
    }),
  handlers: ({ store, config, services, revalidate }) => {
    const listOf = (value: unknown) => {
      const list = value === undefined || value === null ? config.lists[0] : value;
      if (typeof list !== 'string' || !config.lists.includes(list)) throw new InvalidInputError('Choose a list to order.');
      return list;
    };
    const redirects = async (): Promise<SlugRedirectLike[]> => (services.documents ? services.documents.redirects() : []);
    return [
      {
        method: 'GET',
        path: '',
        handle: async ({ url }) => {
          const list = listOf(url.searchParams.get('list'));
          const record = recordOf(list, await store.get(list));
          return json({ order: { ...record, slugs: resolveWorkOrder(record.slugs, await redirects()) } });
        },
      },
      {
        method: 'PUT',
        path: '',
        handle: async ({ request }) => {
          const body = await readBody(request);
          const list = listOf(body.list);
          const slugs = parseWorkOrderSlugs(body.slugs);
          if (!slugs) throw new InvalidInputError('The order couldn’t be read. Reload the page and try again.');
          const saved = await store.set(list, slugs, expectedVersionOf(body));
          await revalidate(['/']);
          return json({ order: recordOf(list, saved) });
        },
      },
    ];
  },
  publicReads: (store, config: WorkOrderConfig, services): WorkOrderReads => {
    const order = async (list = config.lists[0]) => {
      const row = await store.get(list);
      if (!row) return [];
      return resolveWorkOrder(row.value, services.documents ? await services.documents.redirects() : []);
    };
    return {
      order,
      sort: async (items, keyOf, list) => sortByWorkOrder(items, keyOf, await order(list)),
    };
  },
});
