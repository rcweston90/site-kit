/**
 * Where shots are kept: a memory store for tests and quick starts, and the
 * `site_shots` tables in Postgres. Every caption or visibility save can name
 * the shot's version and every reorder the order's; a stale one throws
 * VersionConflictError with what's stored now.
 */

import { toIso, type SqlClient, type SqlRunner } from '@rcweston/story-server/postgres';
import { VersionConflictError } from '../../http.js';
import { sortShots, type ShotRecord, type ShotsOrder } from './model.js';

/** A record as stored: everything but the address it's served at. */
export type StoredShot = Omit<ShotRecord, 'url'>;

export interface NewShot {
  pathname: string;
  width: number;
  height: number;
  blurDataURL?: string | null;
  alt?: string;
  hidden?: boolean;
}

export interface ShotChanges {
  alt?: string;
  hidden?: boolean;
}

export interface ShotsStore {
  /** Every shot in display order, hidden ones included, and the order's version. */
  list(): Promise<{ shots: StoredShot[]; order: ShotsOrder }>;
  get(id: number): Promise<StoredShot | null>;
  /** Insert a processed shot at the end of the order. Idempotent on pathname. */
  insert(shot: NewShot): Promise<StoredShot>;
  /** Change a caption or visibility. Null when there's no such shot. */
  update(id: number, changes: ShotChanges, expectedVersion?: number): Promise<StoredShot | null>;
  /** Apply a new display order: sort_order follows the position in `ids`; shots it doesn't name follow, as they were. */
  reorder(ids: readonly number[], expectedVersion?: number): Promise<ShotsOrder>;
  /** Delete a shot; returns it so the caller can remove the file. */
  remove(id: number): Promise<StoredShot | null>;
}

const placed = (shots: readonly StoredShot[], ids: readonly number[]) => {
  const named = new Set(ids);
  const rest = sortShots(shots).filter((shot) => !named.has(shot.id)).map((shot) => shot.id);
  return [...ids.filter((id) => shots.some((shot) => shot.id === id)), ...rest];
};

export function createMemoryShotsStore(now: () => Date = () => new Date()): ShotsStore {
  const rows = new Map<number, StoredShot>();
  let order: ShotsOrder = { version: 0, updatedAt: null };
  let nextId = 1;
  const copy = (row: StoredShot): StoredShot => structuredClone(row);
  // Writers take turns, like a row lock.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <R>(work: () => R | Promise<R>): Promise<R> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    async list() {
      return { shots: sortShots([...rows.values()]).map(copy), order: { ...order } };
    },
    async get(id) {
      const row = rows.get(id);
      return row ? copy(row) : null;
    },
    insert(shot) {
      return exclusive(() => {
        const at = now().toISOString();
        const existing = [...rows.values()].find((row) => row.pathname === shot.pathname);
        if (existing) {
          const updated = { ...existing, width: shot.width, height: shot.height, blur_data_url: shot.blurDataURL ?? null, updated_at: at };
          rows.set(existing.id, updated);
          return copy(updated);
        }
        const last = Math.max(-1, ...[...rows.values()].map((row) => row.sort_order));
        const row: StoredShot = {
          id: nextId++,
          pathname: shot.pathname,
          width: shot.width,
          height: shot.height,
          blur_data_url: shot.blurDataURL ?? null,
          alt: shot.alt ?? '',
          hidden: shot.hidden ?? false,
          sort_order: last + 1,
          version: 1,
          created_at: at,
          updated_at: at,
        };
        rows.set(row.id, row);
        return copy(row);
      });
    },
    update(id, changes, expectedVersion) {
      return exclusive(() => {
        const current = rows.get(id);
        if (!current) return null;
        if (expectedVersion !== undefined && expectedVersion !== current.version) throw new VersionConflictError(copy(current));
        const row: StoredShot = {
          ...current,
          ...(changes.alt !== undefined ? { alt: changes.alt } : {}),
          ...(changes.hidden !== undefined ? { hidden: changes.hidden } : {}),
          version: current.version + 1,
          updated_at: now().toISOString(),
        };
        rows.set(id, row);
        return copy(row);
      });
    },
    reorder(ids, expectedVersion) {
      return exclusive(() => {
        if (expectedVersion !== undefined && expectedVersion !== order.version) throw new VersionConflictError({ ...order });
        placed([...rows.values()], ids).forEach((id, index) => {
          const row = rows.get(id);
          if (row) rows.set(id, { ...row, sort_order: index });
        });
        order = { version: order.version + 1, updatedAt: now().toISOString() };
        return { ...order };
      });
    },
    remove(id) {
      return exclusive(() => {
        const row = rows.get(id);
        if (!row) return null;
        rows.delete(id);
        return copy(row);
      });
    },
  };
}

const COLUMNS = 'id, media_key, width, height, blur_data_url, alt, hidden, sort_order, version, created_at, updated_at';

function fromRow(row: Record<string, unknown>): StoredShot {
  return {
    id: Number(row.id),
    pathname: String(row.media_key),
    width: Number(row.width),
    height: Number(row.height),
    blur_data_url: (row.blur_data_url as string | null) ?? null,
    alt: (row.alt as string) ?? '',
    hidden: Boolean(row.hidden),
    sort_order: Number(row.sort_order),
    version: Number(row.version),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

const orderFrom = (row: Record<string, unknown> | undefined): ShotsOrder => ({
  version: Number(row?.version ?? 0),
  updatedAt: row?.updated_at ? toIso(row.updated_at) : null,
});

export function createPostgresShotsStore(sql: SqlRunner): ShotsStore {
  const readOne = async (client: SqlClient, id: number) => {
    const { rows } = await client.query(`SELECT ${COLUMNS} FROM site_shots WHERE id = $1`, [id]);
    return rows[0] ? fromRow(rows[0]) : null;
  };
  const readOrder = async (client: SqlClient) => orderFrom((await client.query('SELECT version, updated_at FROM site_shots_order WHERE id = 1')).rows[0]);

  return {
    list: () => sql.read(async (client) => {
      const { rows } = await client.query(`SELECT ${COLUMNS} FROM site_shots ORDER BY sort_order ASC, created_at DESC, id DESC`);
      return { shots: rows.map(fromRow), order: await readOrder(client) };
    }),
    get: (id) => sql.read((client) => readOne(client, id)),
    insert: (shot) =>
      sql.transaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO site_shots (media_key, width, height, blur_data_url, alt, hidden, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sort_order) + 1 FROM site_shots), 0))
           ON CONFLICT (media_key) DO UPDATE SET
             width = EXCLUDED.width,
             height = EXCLUDED.height,
             blur_data_url = EXCLUDED.blur_data_url,
             updated_at = NOW()
           RETURNING ${COLUMNS}`,
          [shot.pathname, shot.width, shot.height, shot.blurDataURL ?? null, shot.alt ?? '', shot.hidden ?? false],
        );
        return fromRow(rows[0]);
      }, 'READ COMMITTED'),
    update: (id, changes, expectedVersion) =>
      sql.transaction(async (tx) => {
        const { rows } = await tx.query(
          `UPDATE site_shots SET
             alt = COALESCE($2, alt),
             hidden = COALESCE($3, hidden),
             version = version + 1,
             updated_at = NOW()
           WHERE id = $1 AND ($4::integer IS NULL OR version = $4)
           RETURNING ${COLUMNS}`,
          [id, changes.alt ?? null, changes.hidden ?? null, expectedVersion ?? null],
        );
        if (rows[0]) return fromRow(rows[0]);
        const current = await readOne(tx, id);
        if (!current) return null;
        throw new VersionConflictError(current);
      }, 'READ COMMITTED'),
    reorder: (ids, expectedVersion) =>
      sql.transaction(async (tx) => {
        // Lock the order row first, so two reorders take turns.
        const { rows: locked } = await tx.query('SELECT version, updated_at FROM site_shots_order WHERE id = 1 FOR UPDATE');
        const current = orderFrom(locked[0]);
        if (expectedVersion !== undefined && expectedVersion !== current.version) throw new VersionConflictError(current);
        const { rows } = await tx.query(`SELECT ${COLUMNS} FROM site_shots`);
        const next = placed(rows.map(fromRow), ids);
        if (next.length) {
          await tx.query(
            `UPDATE site_shots SET sort_order = placed.position - 1
             FROM unnest($1::integer[]) WITH ORDINALITY AS placed(id, position)
             WHERE site_shots.id = placed.id`,
            [next],
          );
        }
        const { rows: saved } = await tx.query(
          `INSERT INTO site_shots_order (id, version, updated_at) VALUES (1, 1, NOW())
           ON CONFLICT (id) DO UPDATE SET version = site_shots_order.version + 1, updated_at = NOW()
           RETURNING version, updated_at`,
        );
        return orderFrom(saved[0]);
      }, 'READ COMMITTED'),
    remove: (id) =>
      sql.transaction(async (tx) => {
        const { rows } = await tx.query(`DELETE FROM site_shots WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
        return rows[0] ? fromRow(rows[0]) : null;
      }, 'READ COMMITTED'),
  };
}
