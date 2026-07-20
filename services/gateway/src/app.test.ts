import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("./clients.js", () => ({
  fetchSeries: vi.fn(),
  fetchMetrics: vi.fn(),
}));

import { fetchSeries, fetchMetrics } from "./clients.js";
import { createApp } from "./app.js";

const fakeSeries = [
  {
    asset: "BTC" as const,
    days: 30,
    points: [{ t: 1, price: 100 }],
    isFallback: true,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  },
];

const fakeMetrics = {
  days: 30,
  generatedAt: "2026-01-01T00:00:00.000Z",
  perAsset: [],
  correlation: { assets: [], matrix: [] },
};

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.mocked(fetchSeries).mockReset();
    vi.mocked(fetchMetrics).mockReset();
  });

  it("returns a composed dashboard payload on success", async () => {
    vi.mocked(fetchSeries).mockResolvedValue(fakeSeries);
    vi.mocked(fetchMetrics).mockResolvedValue(fakeMetrics);

    const app = createApp();
    const res = await request(app).get("/api/dashboard?assets=BTC&days=30");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.assets).toHaveLength(1);
    expect(res.body.data.isFallback).toBe(true);
  });

  it("rejects an unknown asset id with 400", async () => {
    const app = createApp();
    const res = await request(app).get("/api/dashboard?assets=DOGE&days=30");
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects an out-of-range days value with 400", async () => {
    const app = createApp();
    const res = await request(app).get("/api/dashboard?assets=BTC&days=9999");
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("maps an upstream failure to a 502 typed error envelope", async () => {
    vi.mocked(fetchSeries).mockRejectedValue(new Error("boom"));
    vi.mocked(fetchMetrics).mockResolvedValue(fakeMetrics);

    const app = createApp();
    const res = await request(app).get("/api/dashboard?assets=BTC&days=30");

    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe("UPSTREAM_ERROR");
  });
});
