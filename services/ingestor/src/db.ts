import pg from "pg";
import { config } from "./config.js";

/**
 * The narrow surface the repository needs. Both a real pg Pool and pg-mem's
 * adapter satisfy it, so tests run against an in-memory Postgres with zero
 * infra and production runs against Neon (or any Postgres).
 */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

let pool: InstanceType<typeof pg.Pool> | undefined;

/** Lazily opens a single shared pool. Only called at runtime, never in tests. */
export function getPool(): InstanceType<typeof pg.Pool> {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is not set — the ingestor needs a Postgres connection string");
    }
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  }
  return pool;
}

/** Adapts a pg Pool to the minimal Queryable the repository consumes. */
export function createQueryable(p: InstanceType<typeof pg.Pool>): Queryable {
  return { query: (text, params) => p.query(text, params) };
}

/**
 * One table: a daily close per (asset, t). The composite primary key is also
 * the natural upsert target, so re-fetching an overlapping window is idempotent.
 */
export const MIGRATION = `
  CREATE TABLE IF NOT EXISTS price_point (
    asset       TEXT             NOT NULL,
    t           BIGINT           NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    ingested_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (asset, t)
  );
`;

export async function migrate(db: Queryable): Promise<void> {
  await db.query(MIGRATION);
}
