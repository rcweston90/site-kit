import type { StoryCardMedia, StorySummary } from '@rcweston/story-core';
import { newestFirst, sortByWorkOrder } from '@rcweston/site-data/client';

/** `order` is the hand-set order the site shows; the rest sort the view only. */
export type WorkSortKey = 'order' | 'title' | 'org' | 'date' | 'status' | 'updated';
export type SortDirection = 'asc' | 'desc';

export interface WorkSort {
  key: WorkSortKey;
  direction: SortDirection;
}

export function nextWorkSort(current: WorkSort, key: WorkSortKey): WorkSort {
  // The site's order reads one way; reversed, a drag would mean the opposite.
  if (key === 'order') return { key, direction: 'asc' };
  if (current.key !== key) return { key, direction: key === 'date' || key === 'updated' ? 'desc' : 'asc' };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

/** One story as Work lists it. */
export interface StoryRow {
  slug: string;
  title: string;
  company: string;
  year: string;
  updatedAt: string;
  version: number;
  published: boolean;
  /** Switched on to Work (story-placement); on unless switched off. */
  listed: boolean;
  /** The placement's version, for its next save. */
  placementVersion: number;
  /** The story's hero, as its cards show it. */
  cover: StoryCardMedia | null;
}

export function storyRows(stories: readonly StorySummary[], placements: ReadonlyMap<string, { listed: boolean; version: number }>): StoryRow[] {
  return stories
    .map((story): StoryRow => {
      const placement = placements.get(story.slug);
      return {
        slug: story.slug,
        title: story.title || story.slug,
        company: story.company,
        year: story.projectYear ?? '',
        updatedAt: story.updatedAt,
        version: story.latestVersion,
        published: story.publishedDocumentId !== null,
        listed: placement?.listed ?? true,
        placementVersion: placement?.version ?? 0,
        cover: story.cover ?? null,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
}

/**
 * `order` is the site's order, with stories not yet placed after it, newest
 * first, as Work lists them. Every other key sorts the view only; equal keys
 * keep the list's own order in either direction.
 */
export function sortStoryRows(rows: readonly StoryRow[], sort: WorkSort, order: readonly string[] = []): StoryRow[] {
  if (sort.key === 'order') return sortByWorkOrder(newestFirst(rows, (row) => row.year), (row) => row.slug, order);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      let comparison = 0;
      if (sort.key === 'updated') comparison = a.row.updatedAt.localeCompare(b.row.updatedAt);
      else if (sort.key === 'date') comparison = a.row.year.localeCompare(b.row.year);
      else if (sort.key === 'status') comparison = Number(a.row.published) - Number(b.row.published);
      else if (sort.key === 'org') comparison = a.row.company.localeCompare(b.row.company, undefined, { sensitivity: 'base' });
      else comparison = a.row.title.localeCompare(b.row.title, undefined, { sensitivity: 'base' });
      if (comparison === 0) return a.index - b.index;
      return sort.direction === 'asc' ? comparison : -comparison;
    })
    .map(({ row }) => row);
}

/**
 * A list's whole order as the admin shows it: the saved order, then every row
 * it doesn't name yet in the order those rows are shown. Saving always sends
 * all of it, so what's on screen is what the site gets.
 */
export function fullOrder(order: readonly string[], shownInOrder: readonly string[]): string[] {
  const placed = new Set(order);
  return [...order, ...shownInOrder.filter((slug) => !placed.has(slug))];
}

export const placesOf = (slugs: readonly string[]) => new Map(slugs.map((slug, index) => [slug, index + 1]));

/** A free address for a copy: `slug-copy`, then `slug-copy-2`… */
export function copySlug(slug: string, taken: ReadonlySet<string>): string {
  const base = `${slug.slice(0, 70)}-copy`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
