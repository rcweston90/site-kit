/**
 * story-placement: whether a story is listed on the site (the home page and
 * any list of stories). Unlisted stories keep their address and their place
 * in the order; they just aren't shown in lists.
 *
 *   GET /story-placement          { placements: StoryPlacement[] } (only stories someone switched)
 *   PUT /story-placement/:slug    { listed, expectedVersion? } → { placement }
 */

import { isStorySlug } from '@rcweston/story-core';
import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';

import type { StoryPlacement } from './model.js';

export * from './model.js';

export type StoryPlacementStore = VersionedTable<boolean>;

export interface StoryPlacementReads {
  /** Stories switched off, under their current addresses. */
  hiddenSlugs(): Promise<Set<string>>;
  isListed(slug: string): Promise<boolean>;
}

const placementOf = (row: Versioned<boolean>): StoryPlacement => ({ slug: row.key, listed: row.value, version: row.version, updatedAt: row.updatedAt });

/**
 * Placements under current addresses. A switch saved under an old address
 * follows the story, unless the new address has one of its own.
 */
export function currentPlacements(rows: readonly Versioned<boolean>[], redirects: readonly { from: string; to: string }[]): StoryPlacement[] {
  const movedTo = new Map(redirects.map((redirect) => [redirect.from, redirect.to]));
  const current = new Map<string, StoryPlacement>();
  for (const row of rows) if (!movedTo.has(row.key)) current.set(row.key, placementOf(row));
  for (const row of rows) {
    const to = movedTo.get(row.key);
    if (to && !current.has(to)) current.set(to, { ...placementOf(row), slug: to, version: 0 });
  }
  return [...current.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export const storyPlacement = defineModule({
  id: 'story-placement',
  title: 'Story placement',
  migrationRange: [1200, 1299],
  migrations: MIGRATIONS,
  configure: () => ({}),
  createMemoryStore: (): StoryPlacementStore => createMemoryTable<boolean>(),
  createPostgresStore: (sql): StoryPlacementStore =>
    createPostgresTable<boolean>(sql, {
      table: 'site_story_placement',
      keyColumn: 'story_slug',
      columns: ['listed'],
      toRow: (listed) => [listed],
      fromRow: (row) => Boolean(row.listed),
    }),
  handlers: ({ store, services, revalidate }) => [
    {
      method: 'GET',
      path: '',
      handle: async () => json({ placements: currentPlacements(await store.all(), services.documents ? await services.documents.redirects() : []) }),
    },
    {
      method: 'PUT',
      path: ':slug',
      handle: async ({ request, params }) => {
        if (!isStorySlug(params.slug)) throw new InvalidInputError('That story address isn’t valid.');
        const body = await readBody(request);
        if (typeof body.listed !== 'boolean') throw new InvalidInputError('Say whether the story should be listed.');
        const saved = await store.set(params.slug, body.listed, expectedVersionOf(body));
        await revalidate(['/', `/stories/${params.slug}`]);
        return json({ placement: placementOf(saved) });
      },
    },
  ],
  publicReads: (store, _config, services): StoryPlacementReads => {
    const hiddenSlugs = async () => {
      const [rows, redirects] = await Promise.all([store.all(), services.documents ? services.documents.redirects() : []]);
      return new Set(currentPlacements(rows, redirects).filter((placement) => !placement.listed).map((placement) => placement.slug));
    };
    return {
      hiddenSlugs,
      isListed: async (slug) => !(await hiddenSlugs()).has(slug),
    };
  },
});
