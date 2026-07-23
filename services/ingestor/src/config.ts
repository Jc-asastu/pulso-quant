export const config = {
  port: Number(process.env.PORT ?? 4001),
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 10 * 60 * 1000),
  coingeckoBase: process.env.COINGECKO_BASE ?? "https://api.coingecko.com/api/v3",
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? "",
  frankfurterBase: process.env.FRANKFURTER_BASE ?? "https://api.frankfurter.app",
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 5000),
  // Fixtures are cached only briefly so we retry live upstream quickly after a
  // rate-limit, instead of getting stuck on fallback for the full cache window.
  fallbackTtlMs: Number(process.env.FALLBACK_TTL_MS ?? 30 * 1000),
  // Durable store of the price history. When set, the ingestor persists every
  // series it fetches and serves reads from here, using upstream only to refresh.
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Hot cache in front of the DB. Replaces the old in-process Map.
  redisUrl: process.env.REDIS_URL ?? "",
  // How long stored history counts as fresh before we refresh it from upstream.
  seriesFreshMs: Number(process.env.SERIES_FRESH_MS ?? 12 * 60 * 60 * 1000),
};
