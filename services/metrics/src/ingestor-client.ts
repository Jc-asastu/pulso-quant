import type { AssetId, ApiResponse, SeriesWindow } from "@pulso/shared";
import { config } from "./config.js";

/** Thin HTTP client for the ingestor service. Throws on any failure. */
export async function fetchSeriesFromIngestor(
  assets: AssetId[],
  days: number,
): Promise<SeriesWindow[]> {
  const url = `${config.ingestorBaseUrl}/series?assets=${assets.join(",")}&days=${days}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ingestorTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`ingestor responded ${res.status} for ${url}`);
    }
    const body = (await res.json()) as ApiResponse<SeriesWindow[]>;
    if (!body.ok) {
      throw new Error(`ingestor error: ${body.error.code} ${body.error.message}`);
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}
