/**
 * The slice of a Postgres client this package uses. `pg.Pool`, `pg.Client`,
 * PGlite and most serverless drivers fit as they are.
 */

export interface SqlClient {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
  /** Runs several statements at once. PGlite has it; pg runs them through `query` when there are no params. */
  exec?(text: string): Promise<unknown>;
}

/**
 * A pool hands out one connection per transaction (`pg.Pool` and drivers
 * modelled on it). Without `connect`, the client is treated as one
 * connection and calls take turns (PGlite, or a single client wrapped as
 * `{ query: (text, params) => client.query(text, params) }`).
 */
export interface SqlPool extends SqlClient {
  connect?(): Promise<SqlClient & { release(error?: any): void }>;
}

export type Isolation = 'SERIALIZABLE' | 'READ COMMITTED' | 'REPEATABLE READ';

export interface SqlRunner {
  /** Run `work` inside one transaction on one connection. */
  transaction<T>(work: (tx: SqlClient) => Promise<T>, isolation?: Isolation): Promise<T>;
  /** Run a read outside a transaction. */
  read<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
}

export function createSqlRunner(pool: SqlPool): SqlRunner {
  // A single connection can't hold two transactions, and a read in the middle
  // of someone else's would see rows that may still roll back.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  async function inTransaction<T>(client: SqlClient, work: (tx: SqlClient) => Promise<T>, isolation: Isolation): Promise<T> {
    await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolation}`);
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }

  return {
    transaction(work, isolation = 'SERIALIZABLE') {
      if (pool.connect) {
        return (async () => {
          const client = await pool.connect!();
          try {
            return await inTransaction(client, work, isolation);
          } finally {
            client.release();
          }
        })();
      }
      return exclusive(() => inTransaction(pool, work, isolation));
    },
    read(work) {
      return pool.connect ? work(pool) : exclusive(() => work(pool));
    },
  };
}

/** Run a migration's statements. */
export async function execScript(client: SqlClient, sql: string): Promise<void> {
  if (client.exec) await client.exec(sql);
  else await client.query(sql);
}

export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

export function parseJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}
