export const config = {
  port: Number(process.env.PORT ?? 4001),
  cacheTtlMs: Number(process.env.CACHE_TTL_MS ?? 10 * 60 * 1000),
  coingeckoBase: process.env.COINGECKO_BASE ?? "https://api.coingecko.com/api/v3",
  frankfurterBase: process.env.FRANKFURTER_BASE ?? "https://api.frankfurter.app",
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 5000),
};
