import type { PricePoint } from "@pulso/shared";
import { config } from "../config.js";

interface TimeSeriesResponse {
  amount: number;
  base: string;
  rates: Record<string, Record<string, number>>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches a daily FX time series from Frankfurter.app for `base`/`quote`
 * (e.g. base=EUR, quote=USD). Frankfurter has no fixed "days" window param,
 * so we compute a start date ourselves. Throws on failure.
 */
export async function fetchFrankfurterSeries(
  base: string,
  quote: string,
  days: number,
): Promise<PricePoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const url = `${config.frankfurterBase}/${isoDate(start)}..${isoDate(end)}?from=${base}&to=${quote}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Frankfurter ${base}/${quote} responded ${res.status}`);
    }
    const body = (await res.json()) as TimeSeriesResponse;
    if (!body.rates || typeof body.rates !== "object") {
      throw new Error(`Frankfurter ${base}/${quote} returned malformed payload`);
    }
    const points: PricePoint[] = Object.entries(body.rates)
      .map(([date, rates]) => {
        const rate = rates[quote];
        if (rate === undefined) return undefined;
        return { t: new Date(`${date}T00:00:00Z`).getTime(), price: rate };
      })
      .filter((p): p is PricePoint => p !== undefined)
      .sort((a, b) => a.t - b.t);
    if (points.length === 0) {
      throw new Error(`Frankfurter ${base}/${quote} returned zero points`);
    }
    return points;
  } finally {
    clearTimeout(timeout);
  }
}
