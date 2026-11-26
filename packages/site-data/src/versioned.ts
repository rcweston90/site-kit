/**
 * One versioned record per key, the shape most site settings take. Every
 * write can name the version it was built on; a write on an older version is
 * refused with what's there now, so two tabs can't silently undo each other.
 */

import { toIso, type SqlClient, type SqlRunner } from '@rcweston/story-server/postgres';
import { VersionConflictError } from './http.js';

export interface Versioned<T> {
  key: string;
  value: T;
  /** 0 before the first save. */
  version: number;
  /** When it was last saved, or null before the first save. */
  updatedAt: string | null;
}

export interface VersionedTable<T> {
  all(): Promise<Versioned<T>[]>;
  get(key: string): Promise<Versioned<T> | null>;
  /**
   * Save `value` under `key`. With `expectedVersion`, the save only goes
   * through when the stored version still matches (0: nothing saved yet),
   * and throws VersionConflictError with the current record otherwise.
   */
  set(key: string, value: T, expectedVersion?: number): Promise<Versioned<T>>;
  remove(key: string): Promise<void>;
}

export function createMemoryTable<T>(now: () => Date = () => new Date()): VersionedTable<T> {
  const rows = new Map<string, Versioned<T>>();
  const copy = (row: Versioned<T>): Versioned<T> => structuredClone(row);
  // Writers take turns, like a row lock.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <R>(work: () => R | Promise<R>): Promise<R> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    async all() {
      return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)).map(copy);
    },
    async get(key) {
      const row = rows.get(key);
      return row ? copy(row) : null;
    },
    set(key, value, expectedVersion) {
      return exclusive(() => {
        const current = rows.get(key);
        const version = current?.version ?? 0;
        if (expectedVersion !== undefined && expectedVersion !== version) {
          throw new VersionConflictError(current ? copy(current) : null);
        }
        const row: Versioned<T> = { key, value: structuredClone(value), version: version + 1, updatedAt: now().toISOString() };
        rows.set(key, row);
        return copy(row);
      });
    },
    remove(key) {
      return exclusive(() => {
        rows.delete(key);
      });
    },
  };
}

export interface PostgresTableShape<T> {
  table: string;
  keyColumn: string;
  /** Columns holding the value, in order. */
  columns: string[];
  toRow(value: T): unknown[];
  fromRow(row: Record<string, unknown>): T;
}

/** A versioned table in Postgres: `<key> PK, <columns…>, version INTEGER, updated_at TIMESTAMPTZ`. */
export function createPostgresTable<T>(sql: SqlRunner, shape: PostgresTableShape<T>): VersionedTable<T> {
  const { table, keyColumn, columns } = shape;
  const list = columns.join(', ');
  const returning = `RETURNING ${keyColumn} AS key, ${list}, version, updated_at`;
  const select = `SELECT ${keyColumn} AS key, ${list}, version, updated_at FROM ${table}`;
  const map = (row: Record<string, unknown>): Versioned<T> => ({
    key: String(row.key),
    value: shape.fromRow(row),
    version: Number(row.version),
    updatedAt: row.updated_at ? toIso(row.updated_at) : null,
  });
  const read = async (client: SqlClient, key: string) => {
    const { rows } = await client.query(`${select} WHERE ${keyColumn} = $1`, [key]);
    return rows[0] ? map(rows[0]) : null;
  };
  const placeholders = columns.map((_, index) => `$${index + 2}`).join(', ');
  const fromExcluded = columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  const fromParams = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  const insert = `INSERT INTO ${table} (${keyColumn}, ${list}, version, updated_at) VALUES ($1, ${placeholders}, 1, NOW())`;

  return {
    all: () => sql.read(async (client) => (await client.query(`${select} ORDER BY ${keyColumn}`)).rows.map(map)),
    get: (key) => sql.read((client) => read(client, key)),
    set: (key, value, expectedVersion) =>
      sql.transaction(async (tx) => {
        const params = [key, ...shape.toRow(value)];
        let result: { rows: Record<string, unknown>[] };
        if (expectedVersion === undefined) {
          result = await tx.query(`${insert} ON CONFLICT (${keyColumn}) DO UPDATE SET ${fromExcluded}, version = ${table}.version + 1, updated_at = NOW() ${returning}`, params);
        } else if (expectedVersion === 0) {
          result = await tx.query(`${insert} ON CONFLICT (${keyColumn}) DO NOTHING ${returning}`, params);
        } else {
          result = await tx.query(
            `UPDATE ${table} SET ${fromParams}, version = version + 1, updated_at = NOW() WHERE ${keyColumn} = $1 AND version = $${columns.length + 2} ${returning}`,
            [...params, expectedVersion],
          );
        }
        if (result.rows[0]) return map(result.rows[0]);
        throw new VersionConflictError(await read(tx, key));
      }, 'READ COMMITTED'),
    remove: (key) =>
      sql.transaction(async (tx) => {
        await tx.query(`DELETE FROM ${table} WHERE ${keyColumn} = $1`, [key]);
      }, 'READ COMMITTED'),
  };
}
