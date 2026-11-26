/**
 * Shots gallery metadata. Each record is a processed photo: the heavy work
 * (compress, dimensions, LQIP blur) happens once at ingestion, so the public
 * page just reads the table instead of reprocessing every file on each
 * render. `pathname` is the MediaStore key (used to delete the file).
 * Browser-safe: the admin imports these types and helpers.
 */

export interface ShotRecord {
  id: number;
  /** Where a browser loads the file. */
  url: string;
  /** The MediaStore key. */
  pathname: string;
  width: number;
  height: number;
  blur_data_url: string | null;
  alt: string;
  /** Kept in the library, left off the public gallery. */
  hidden: boolean;
  sort_order: number;
  /** Bumped by every caption or visibility save; a stale one answers 409. */
  version: number;
  created_at: string;
  updated_at: string;
}

/** The order as a whole: its own version, so two tabs can't reshuffle each other. */
export interface ShotsOrder {
  version: number;
  updatedAt: string | null;
}

/** What the admin list loads. */
export interface ShotsList {
  shots: ShotRecord[];
  order: ShotsOrder;
}

/** A shot as the public gallery draws it. */
export interface Photo {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Tiny base64 LQIP for a blur-up placeholder while the full image loads. */
  blurDataURL?: string;
}

/** 25MB raw (camera originals). */
export const SHOTS_MAX_UPLOAD = 25 * 1024 * 1024;
/** Longest caption a save takes. */
export const SHOT_ALT_MAX = 500;
/** Most shots one reorder may name. */
export const SHOTS_MAX_ORDER = 5000;

/** "harbor-wall_2019.jpg" -> "harbor wall 2019" (a sensible default alt). */
export function altFromFilename(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

/** All shots in display order (manual sort_order, newest first as a tiebreak). */
export function sortShots<T extends Pick<ShotRecord, 'sort_order' | 'created_at' | 'id'>>(shots: readonly T[]): T[] {
  return [...shots].sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

/** A record mapped to the `Photo` shape the collage wants. */
export function toPhoto(record: ShotRecord): Photo {
  return {
    src: record.url,
    alt: record.alt || '',
    width: record.width,
    height: record.height,
    ...(record.blur_data_url ? { blurDataURL: record.blur_data_url } : {}),
  };
}

/** The shots the public gallery shows: in order, without hidden ones. */
export function publicPhotos(shots: readonly ShotRecord[]): Photo[] {
  return sortShots(shots.filter((shot) => !shot.hidden)).map(toPhoto);
}

export type ShotsPatch =
  | { kind: 'order'; ids: number[]; expectedVersion?: number }
  | { kind: 'shot'; id: number; alt?: string; hidden?: boolean; expectedVersion?: number };

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const versionOf = (value: unknown): number | undefined | null => {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
};

/**
 * A PATCH body: a caption or visibility (`{ id, alt?, hidden?, expectedVersion? }`)
 * or a new order (`{ order: number[], expectedVersion? }`). Null when it's neither.
 */
export function parseShotsPatch(body: Record<string, unknown>): ShotsPatch | null {
  const expectedVersion = versionOf(body.expectedVersion);
  if (expectedVersion === null) return null;
  if (Array.isArray(body.order)) {
    const ids = body.order.map((id) => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id));
    if (ids.length > SHOTS_MAX_ORDER || !ids.every(isId)) return null;
    return { kind: 'order', ids: [...new Set(ids as number[])], expectedVersion };
  }
  if (!isId(body.id)) return null;
  const patch: ShotsPatch = { kind: 'shot', id: body.id, expectedVersion };
  if (body.alt !== undefined) {
    if (typeof body.alt !== 'string' || body.alt.length > SHOT_ALT_MAX) return null;
    patch.alt = body.alt;
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') return null;
    patch.hidden = body.hidden;
  }
  if (patch.alt === undefined && patch.hidden === undefined) return null;
  return patch;
}

/** Kept captions: a map of shot id to the text typed. */
export type ShotCaptions = Record<string, string>;
export const isShotCaptions = (value: unknown): value is ShotCaptions =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((text) => typeof text === 'string'));
