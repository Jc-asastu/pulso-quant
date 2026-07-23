import { describe, it, expect, beforeEach } from "vitest";
import RedisMock from "ioredis-mock";
import { createSeriesCache, type SeriesCache } from "./cache.js";
import type { SeriesWindow } from "@pulso/shared";

const sample: SeriesWindow = {
  asset: "BTC",
  days: 3,
  points: [
    { t: 1000, price: 10 },
    { t: 2000, price: 20 },
    { t: 3000, price: 30 },
  ],
  isFallback: false,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

describe("SeriesCache (Redis-backed)", () => {
  let cache: SeriesCache;
  let redis: InstanceType<typeof RedisMock>;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushdb();
    cache = createSeriesCache(redis, 1000);
  });

  it("round-trips a SeriesWindow", async () => {
    await cache.set("BTC:3", sample);
    expect(await cache.get("BTC:3")).toEqual(sample);
  });

  it("returns undefined for a missing key", async () => {
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("reads malformed JSON as a miss", async () => {
    await redis.set("series:BTC:3", "{not valid json");
    expect(await cache.get("BTC:3")).toBeUndefined();
  });

  it("reads a schema-violating entry as a miss", async () => {
    await redis.set("series:BTC:3", JSON.stringify({ garbage: true }));
    expect(await cache.get("BTC:3")).toBeUndefined();
  });

  it("del removes a single entry", async () => {
    await cache.set("BTC:3", sample);
    await cache.del("BTC:3");
    expect(await cache.get("BTC:3")).toBeUndefined();
  });

  it("clear removes everything", async () => {
    await cache.set("BTC:3", sample);
    await cache.set("ETH:3", { ...sample, asset: "ETH" });
    await cache.clear();
    expect(await cache.get("BTC:3")).toBeUndefined();
    expect(await cache.get("ETH:3")).toBeUndefined();
  });

  it("expires an entry after its PX ttl", async () => {
    await cache.set("BTC:3", sample, 20);
    await new Promise((r) => setTimeout(r, 45));
    expect(await cache.get("BTC:3")).toBeUndefined();
  });
});
