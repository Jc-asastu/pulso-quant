import type { AssetId, ApiResponse, DashboardResponse } from "@pulso/shared";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:4003";

export async function fetchDashboard(
  assets: AssetId[],
  days: number,
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  const url = `${GATEWAY_URL}/api/dashboard?assets=${assets.join(",")}&days=${days}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`gateway responded ${res.status}`);
  }
  const body = (await res.json()) as ApiResponse<DashboardResponse>;
  if (!body.ok) {
    throw new Error(`${body.error.code}: ${body.error.message}`);
  }
  return body.data;
}
