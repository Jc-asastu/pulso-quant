import { ASSET_CATALOG, type AssetId, type SeriesWindow } from "@pulso/shared";
import { TtlCache } from "./cache.js";
import { config } from "./config.js";
import { getFixtureSeries } from "./fixtures.js";
import { fetchCoingeckoSeries } from "./sources/coingecko.js";
import { fetchFrankfurterSeries } from "./sources/frankfurter.js";

const cache = new TtlCache<SeriesWindow>(config.cacheTtlMs);

function cacheKey(asset: AssetId, days: number): string {
  return `${asset}:${days}`;
}

async function fetchLive(asset: AssetId, days: number): Promise<SeriesWindow> {
  const meta = ASSET_CATALOG[asset];
  const points =
    meta.kind === "crypto"
      ? await fetchCoingeckoSeries(meta.sourceId, days)
      : await (() => {
          const [base, quote] = meta.sourceId.split("-");
          if (!base || !quote) throw new Error(`Bad FX sourceId for ${asset}`);
          return fetchFrankfurterSeries(base, quote, days);
        })();

  return {
    asset,
    days,
    points,
    isFallback: false,
    fetchedAt: new Date().toISOString(),
  };
}

function fetchFallback(asset: AssetId, days: number): SeriesWindow {
  return {
    asset,
    days,
    points: getFixtureSeries(asset, days),
    isFallback: true,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Returns a SeriesWindow for the asset, preferring cache, then a live
 * upstream call, then bundled fixtures. This function never throws —
 * fixtures are the guaranteed last resort so the app always works offline
 * or when a public API rate-limits us.
 */
export async function getSeries(asset: AssetId, days: number): Promise<SeriesWindow> {
  const key = cacheKey(asset, days);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const live = await fetchLive(asset, days);
    if (live.points.length === 0) throw new Error("empty series from upstream");
    cache.set(key, live);
    return live;
  } catch {
    // Upstream failed, rate-limited, or timed out — serve fixtures.
    // Deliberately not cached as "live" so we retry upstream next TTL window,
    // but we do cache the fallback briefly to avoid hammering fixtures reads.
    const fallback = fetchFallback(asset, days);
    cache.set(key, fallback);
    return fallback;
  }
}

export function clearSeriesCache(): void {
  cache.clear();
}
