/**
 * The hand-set order of a list of stories, as pure functions so the admin
 * list, the home page and any other surface read it the same way. Nothing
 * here touches storage: the admin imports it to sort rows while dragging.
 * Browser-safe.
 *
 * One order per list, shared by every surface that shows it. A surface that
 * shows a subset keeps the same relative order; a hidden row keeps its place
 * for when it comes back.
 */

export interface WorkOrderConfig {
  /** The lists that can be ordered. Default `['stories']`. */
  lists: string[];
}

export interface WorkOrderRecord {
  list: string;
  /** First to last, under the address each had when it was saved. */
  slugs: string[];
  version: number;
  updatedAt: string | null;
}

export interface SlugRedirectLike {
  from: string;
  to: string;
}

const LIST = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function configureWorkOrder(config: Partial<WorkOrderConfig> | undefined): WorkOrderConfig {
  const lists = config?.lists ?? ['stories'];
  for (const list of lists) if (!LIST.test(list)) throw new Error(`work-order: ${list} isn't a list name like stories.`);
  return { lists: [...new Set(lists)] };
}

/**
 * The saved slugs under their current addresses. Slugs are saved under the
 * address they had at the time, so each is read through the (flat, one-hop)
 * redirect table: a renamed story keeps its place.
 */
export function resolveWorkOrder(slugs: readonly string[], redirects: readonly SlugRedirectLike[] = []): string[] {
  const movedTo = new Map(redirects.map((redirect) => [redirect.from, redirect.to]));
  return [...new Set(slugs.map((slug) => movedTo.get(slug) ?? slug))];
}

/**
 * `items` in `order`. Anything the order doesn't name follows, in the order
 * it arrived, so a new story lands at the end instead of reshuffling the list.
 */
export function sortByWorkOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = new Map(order.map((slug, index) => [slug, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(keyOf(item)) ?? Infinity }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map(({ item }) => item);
}

/** Newest first by ISO date, ties in arrival order: a list before anyone arranges it. */
export function newestFirst<T>(items: readonly T[], dateOf: (item: T) => string | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, date: dateOf(item) ?? '' }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * The whole list after rearranging some of it. `visible` is the rows on
 * screen in their new order (a search may hide others): they trade the places
 * they held between them, and every other slug stays exactly where it was.
 */
export function placeVisibleOrder(full: readonly string[], visible: readonly string[]): string[] {
  const moving = new Set(visible);
  const all = [...full, ...visible.filter((slug) => !full.includes(slug))];
  let next = 0;
  return all.map((slug) => (moving.has(slug) ? visible[next++] : slug));
}

/** `list` with the item at `from` moved to `to`. */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Limits on what a save may send: a list is a few dozen addresses, never thousands. */
export const WORK_ORDER_MAX_ITEMS = 500;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The slugs a save sends, or null when they aren't a list of addresses. */
export function parseWorkOrderSlugs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > WORK_ORDER_MAX_ITEMS) return null;
  if (!value.every((slug) => typeof slug === 'string' && slug.length <= 120 && SLUG_PATTERN.test(slug))) return null;
  return [...new Set(value as string[])];
}
