import type { AssetId } from "@pulso/shared";

export const config = {
  port: Number(process.env.PORT ?? 4003),
  ingestorBaseUrl: process.env.INGESTOR_BASE_URL ?? "http://localhost:4001",
  metricsBaseUrl: process.env.METRICS_BASE_URL ?? "http://localhost:4002",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 10000),
  defaultAssets: (process.env.DEFAULT_ASSETS ?? "BTC,ETH,SOL,EURUSD,USDJPY,USDARS").split(
    ",",
  ) as AssetId[],
  defaultDays: Number(process.env.DEFAULT_DAYS ?? 90),
};
