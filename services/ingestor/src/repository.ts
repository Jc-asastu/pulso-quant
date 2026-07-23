import type { AssetId, PricePoint } from "@pulso/shared";
import type { Queryable } from "./db.js";

export interface Coverage {
  /** How many stored points exist for the asset. */
  count: number;
  /** Newest data timestamp (unix ms), or null if nothing is stored. */
  latestT: number | null;
  /** When we last wrote/refreshed this asset (unix ms), or null if empty. */
  refreshedAt: number | null;
}

export interface SeriesRepository {
  upsertPoints(asset: AssetId, points: PricePoint[]): Promise<void>;
  getWindow(asset: AssetId, days: number): Promise<PricePoint[]>;
  coverage(asset: AssetId): Promise<Coverage>;
}

/**
 * SQL persistence for daily price series. The upstream APIs are only a refresh
 * source: everything we fetch lands here, and reads come back out of Postgres.
 */
export function createSeriesRepository(db: Queryable): SeriesRepository {
  return {
    async upsertPoints(asset, points) {
      if (points.length === 0) return;
      const values: unknown[] = [];
      const tuples = points.map((p, i) => {
        const b = i * 3;
        values.push(asset, p.t, p.price);
        return `($${b + 1}, $${b + 2}, $${b + 3})`;
      });
      await db.query(
        `INSERT INTO price_point (asset, t, price) VALUES ${tuples.join(", ")} ` +
          `ON CONFLICT (asset, t) DO UPDATE SET price = EXCLUDED.price, ingested_at = now()`,
        values,
      );
    },

    async getWindow(asset, days) {
      // Newest `days` points, returned ascending by time for the charts.
      const { rows } = await db.query(
        `SELECT t, price FROM price_point WHERE asset = $1 ORDER BY t DESC LIMIT $2`,
        [asset, days],
      );
      return rows
        .map((r) => ({ t: Number(r.t), price: Number(r.price) }))
        .reverse();
    },

    async coverage(asset) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS count,
                MAX(t)           AS latest_t,
                MAX(ingested_at) AS refreshed_at
           FROM price_point
          WHERE asset = $1`,
        [asset],
      );
      const row = rows[0] ?? {};
      return {
        count: Number(row.count ?? 0),
        latestT: row.latest_t == null ? null : Number(row.latest_t),
        refreshedAt: row.refreshed_at == null ? null : new Date(row.refreshed_at).getTime(),
      };
    },
  };
}
