import type { PricePoint } from "@pulso/shared";
import { config } from "../config.js";

interface MarketChartResponse {
  prices: [number, number][];
}

/**
 * Fetches daily prices for a CoinGecko coin id. Throws on any failure
 * (network, non-2xx, rate-limit, malformed body) — callers decide whether
 * to fall back to fixtures.
 */
export async function fetchCoingeckoSeries(
  coinId: string,
  days: number,
): Promise<PricePoint[]> {
  const url = `${config.coingeckoBase}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.coingeckoApiKey) {
    headers["x-cg-demo-api-key"] = config.coingeckoApiKey;
  }
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      throw new Error(`CoinGecko ${coinId} responded ${res.status}`);
    }
    const body = (await res.json()) as MarketChartResponse;
    if (!Array.isArray(body.prices)) {
      throw new Error(`CoinGecko ${coinId} returned malformed payload`);
    }
    return body.prices.map(([t, price]) => ({ t, price }));
  } finally {
    clearTimeout(timeout);
  }
}
