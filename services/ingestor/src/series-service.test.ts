import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the live fetchers to always fail so getSeries falls back to fixtures
// deterministically, regardless of network availability in CI/sandboxes.
vi.mock("./sources/coingecko.js", () => ({
  fetchCoingeckoSeries: vi.fn().mockRejectedValue(new Error("network disabled in test")),
}));
vi.mock("./sources/frankfurter.js", () => ({
  fetchFrankfurterSeries: vi.fn().mockRejectedValue(new Error("network disabled in test")),
}));

import { getSeries, clearSeriesCache } from "./series-service.js";

describe("getSeries", () => {
  beforeEach(() => {
    clearSeriesCache();
  });

  it("falls back to fixtures when the upstream source fails", async () => {
    const series = await getSeries("BTC", 30);
    expect(series.isFallback).toBe(true);
    expect(series.points.length).toBe(30);
    expect(series.asset).toBe("BTC");
  });

  it("returns points sorted ascending by time", async () => {
    const series = await getSeries("ETH", 10);
    for (let i = 1; i < series.points.length; i++) {
      expect(series.points[i]!.t).toBeGreaterThan(series.points[i - 1]!.t);
    }
  });

  it("caches the result so a second call returns the same fetchedAt", async () => {
    const first = await getSeries("SOL", 5);
    const second = await getSeries("SOL", 5);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });
});
