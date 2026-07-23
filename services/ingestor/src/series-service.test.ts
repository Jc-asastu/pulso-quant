import { describe, it, expect, beforeEach, vi } from "vitest";
import { newDb } from "pg-mem";
import RedisMock from "ioredis-mock";

// Control the upstream fetchers so tests are deterministic and offline.
const coingecko = vi.fn();
vi.mock("./sources/coingecko.js", () => ({
  fetchCoingeckoSeries: (...args: unknown[]) => coingecko(...args),
}));
vi.mock("./sources/frankfurter.js", () => ({
  fetchFrankfurterSeries: vi.fn().mockRejectedValue(new Error("no fx assets in catalog")),
}));

import { createSeriesService } from "./series-service.js";
import { createSeriesRepository } from "./repository.js";
import { createSeriesCache } from "./cache.js";
import { migrate, type Queryable } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Each test gets its own isolated, migrated Postgres + Redis stack.
async function harness(clock: { v: number }) {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  const db: Queryable = { query: (text, params) => pool.query(text, params) };
  await migrate(db);
  const repo = createSeriesRepository(db);
  const cache = createSeriesCache(new RedisMock(), 60_000);
  const svc = createSeriesService({ repo, cache, now: () => clock.v });
  return { svc, repo, cache };
}

describe("createSeriesService", () => {
  let clock: { v: number };

  beforeEach(() => {
    // Base the clock on real time so it lines up with the DB's ingested_at
    // (pg-mem's now()); tests advance it explicitly to age the data.
    clock = { v: Date.now() };
    coingecko.mockReset();
  });

  it("fetches from upstream on a cold miss and persists to Postgres", async () => {
    coingecko.mockResolvedValue([
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
    ]);
    const { svc, repo } = await harness(clock);
    const win = await svc.getSeries("BTC", 2);
    expect(win.isFallback).toBe(false);
    expect(win.points).toEqual([
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
    ]);
    expect((await repo.coverage("BTC")).count).toBe(2);
  });

  it("serves the hot cache on a second call without re-fetching", async () => {
    coingecko.mockResolvedValue([{ t: 1000, price: 10 }]);
    const { svc } = await harness(clock);
    await svc.getSeries("BTC", 1);
    await svc.getSeries("BTC", 1);
    expect(coingecko).toHaveBeenCalledTimes(1);
  });

  it("serves fresh Postgres data when the cache is cold but the DB is recent", async () => {
    coingecko.mockResolvedValue([
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
    ]);
    const { svc, cache } = await harness(clock);
    await svc.getSeries("BTC", 2); // seeds DB + cache
    await cache.clear(); // drop the hot cache, keep the DB
    const win = await svc.getSeries("BTC", 2);
    expect(coingecko).toHaveBeenCalledTimes(1); // DB was fresh, no refetch
    expect(win.isFallback).toBe(false);
    expect(win.points.length).toBe(2);
  });

  it("refetches upstream once the stored data goes stale", async () => {
    coingecko.mockResolvedValue([{ t: 1000, price: 10 }]);
    const { svc, cache } = await harness(clock);
    await svc.getSeries("BTC", 1);
    await cache.clear();
    clock.v += 2 * DAY_MS; // past seriesFreshMs (12h)
    await svc.getSeries("BTC", 1);
    expect(coingecko).toHaveBeenCalledTimes(2);
  });

  it("serves stale DB data (not fixtures) when upstream fails but the DB has data", async () => {
    coingecko.mockResolvedValueOnce([
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
    ]);
    const { svc, cache } = await harness(clock);
    await svc.getSeries("BTC", 2); // seed
    await cache.clear();
    clock.v += 2 * DAY_MS; // stale → will attempt upstream
    coingecko.mockRejectedValueOnce(new Error("rate limited"));
    const win = await svc.getSeries("BTC", 2);
    expect(win.isFallback).toBe(false); // real data, out of Postgres
    expect(win.points.length).toBe(2);
  });

  it("falls back to fixtures when upstream fails and the DB is empty", async () => {
    coingecko.mockRejectedValue(new Error("rate limited"));
    const { svc } = await harness(clock);
    const win = await svc.getSeries("BTC", 30);
    expect(win.isFallback).toBe(true);
    expect(win.points.length).toBe(30);
  });
});
