import type { AssetId, ApiResponse, SeriesWindow, MetricsReport } from "@pulso/shared";
import { config } from "./config.js";

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${url} responded ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSeries(assets: AssetId[], days: number): Promise<SeriesWindow[]> {
  const url = `${config.ingestorBaseUrl}/series?assets=${assets.join(",")}&days=${days}`;
  const body = await getJson<ApiResponse<SeriesWindow[]>>(url);
  if (!body.ok) throw new Error(`ingestor: ${body.error.code} ${body.error.message}`);
  return body.data;
}

export async function fetchMetrics(assets: AssetId[], days: number): Promise<MetricsReport> {
  const url = `${config.metricsBaseUrl}/metrics?assets=${assets.join(",")}&days=${days}`;
  const body = await getJson<ApiResponse<MetricsReport>>(url);
  if (!body.ok) throw new Error(`metrics: ${body.error.code} ${body.error.message}`);
  return body.data;
}
