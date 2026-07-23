import { ASSET_CATALOG, type AssetId, type PricePoint, type SeriesWindow } from "@pulso/shared";
import type { SeriesCache } from "./cache.js";
import type { SeriesRepository } from "./repository.js";
import { createSeriesCache } from "./cache.js";
import { createSeriesRepository } from "./repository.js";
import { config } from "./config.js";
import { createQueryable, getPool } from "./db.js";
import { getRedis } from "./redis.js";
import { getFixtureSeries } from "./fixtures.js";
import { fetchCoingeckoSeries } from "./sources/coingecko.js";
import { fetchFrankfurterSeries } from "./sources/frankfurter.js";

function cacheKey(asset: AssetId, days: number): string {
  return `${asset}:${days}`;
}

async function fetchLivePoints(asset: AssetId, days: number): Promise<PricePoint[]> {
  const meta = ASSET_CATALOG[asset];
  if (meta.kind === "crypto") return fetchCoingeckoSeries(meta.sourceId, days);
  const [base, quote] = meta.sourceId.split("-");
  if (!base || !quote) throw new Error(`Bad FX sourceId for ${asset}`);
  return fetchFrankfurterSeries(base, quote, days);
}

export interface SeriesServiceDeps {
  repo: SeriesRepository;
  cache: SeriesCache;
  /** Injectable clock so freshness logic is testable without real time. */
  now?: () => number;
}

/**
 * Resolves a SeriesWindow through four tiers, cheapest first:
 *
 *   1. Redis hot cache — a recent, ready-to-serve window.
 *   2. Postgres, if its data is fresh enough — read from our own store.
 *   3. Upstream API — fetch, persist to Postgres, then serve from Postgres.
 *   4. On upstream failure: stale Postgres data if we have any, else bundled
 *      fixtures as the last-resort offline fallback.
 *
 * Only tier 4's fixtures set isFallback:true; tiers 1-3 are real data.
 */
export function createSeriesService({ repo, cache, now = () => Date.now() }: SeriesServiceDeps) {
  function windowFrom(asset: AssetId, days: number, points: PricePoint[], isFallback = false): SeriesWindow {
    return { asset, days, points, isFallback, fetchedAt: new Date(now()).toISOString() };
  }

  async function getSeries(asset: AssetId, days: number): Promise<SeriesWindow> {
    const key = cacheKey(asset, days);

    const cached = await cache.get(key);
    if (cached) return cached;

    const cov = await repo.coverage(asset);
    const dbFresh =
      cov.refreshedAt !== null &&
      now() - cov.refreshedAt < config.seriesFreshMs &&
      cov.count >= days;

    if (dbFresh) {
      const window = windowFrom(asset, days, await repo.getWindow(asset, days));
      await cache.set(key, window);
      return window;
    }

    try {
      const live = await fetchLivePoints(asset, days);
      if (live.length === 0) throw new Error("empty series from upstream");
      await repo.upsertPoints(asset, live);
      const window = windowFrom(asset, days, await repo.getWindow(asset, days));
      await cache.set(key, window);
      return window;
    } catch {
      // Upstream failed, rate-limited, or timed out.
      if (cov.count > 0) {
        // Real data we already hold beats synthetic fixtures, even if stale.
        const window = windowFrom(asset, days, await repo.getWindow(asset, days));
        await cache.set(key, window, config.fallbackTtlMs);
        return window;
      }
      const fallback = windowFrom(asset, days, getFixtureSeries(asset, days), true);
      await cache.set(key, fallback, config.fallbackTtlMs);
      return fallback;
    }
  }

  return { getSeries };
}

// ----------------------------------------------------------------------------
// Default instance, wired to real Postgres + Redis. Clients connect lazily on
// first use, so importing this module (e.g. in the HTTP app) never opens a
// socket — unit tests build their own service with in-memory fakes instead.
// ----------------------------------------------------------------------------

let defaultService: ReturnType<typeof createSeriesService> | undefined;
let defaultCache: SeriesCache | undefined;

function getDefaultService() {
  if (!defaultService) {
    const repo = createSeriesRepository(createQueryable(getPool()));
    defaultCache = createSeriesCache(getRedis(), config.cacheTtlMs);
    defaultService = createSeriesService({ repo, cache: defaultCache });
  }
  return defaultService;
}

export function getSeries(asset: AssetId, days: number): Promise<SeriesWindow> {
  return getDefaultService().getSeries(asset, days);
}

export async function clearSeriesCache(): Promise<void> {
  if (defaultCache) await defaultCache.clear();
}
