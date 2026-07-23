import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { createSeriesRepository, type SeriesRepository } from "./repository.js";
import { migrate, type Queryable } from "./db.js";

function makeDb(): Queryable {
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  return { query: (text, params) => pool.query(text, params) };
}

describe("SeriesRepository (Postgres)", () => {
  let repo: SeriesRepository;

  beforeEach(async () => {
    const db = makeDb();
    await migrate(db);
    repo = createSeriesRepository(db);
  });

  it("reports empty coverage for an asset with no data", async () => {
    const cov = await repo.coverage("BTC");
    expect(cov.count).toBe(0);
    expect(cov.latestT).toBeNull();
    expect(cov.refreshedAt).toBeNull();
  });

  it("persists points and reads them back ascending by time", async () => {
    await repo.upsertPoints("BTC", [
      { t: 3000, price: 30 },
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
    ]);
    const win = await repo.getWindow("BTC", 10);
    expect(win).toEqual([
      { t: 1000, price: 10 },
      { t: 2000, price: 20 },
      { t: 3000, price: 30 },
    ]);
  });

  it("getWindow returns only the newest N points", async () => {
    await repo.upsertPoints("ETH", [
      { t: 1000, price: 1 },
      { t: 2000, price: 2 },
      { t: 3000, price: 3 },
    ]);
    const win = await repo.getWindow("ETH", 2);
    expect(win.map((p) => p.t)).toEqual([2000, 3000]);
  });

  it("is idempotent on (asset,t) and overwrites the price", async () => {
    await repo.upsertPoints("SOL", [{ t: 1000, price: 100 }]);
    await repo.upsertPoints("SOL", [{ t: 1000, price: 150 }]);
    expect(await repo.getWindow("SOL", 10)).toEqual([{ t: 1000, price: 150 }]);
    expect((await repo.coverage("SOL")).count).toBe(1);
  });

  it("coverage reports count and the latest timestamp", async () => {
    await repo.upsertPoints("BTC", [
      { t: 1000, price: 1 },
      { t: 5000, price: 2 },
    ]);
    const cov = await repo.coverage("BTC");
    expect(cov.count).toBe(2);
    expect(cov.latestT).toBe(5000);
    expect(cov.refreshedAt).not.toBeNull();
  });

  it("keeps assets isolated from one another", async () => {
    await repo.upsertPoints("BTC", [{ t: 1000, price: 1 }]);
    await repo.upsertPoints("ETH", [{ t: 1000, price: 9 }]);
    expect(await repo.getWindow("BTC", 10)).toEqual([{ t: 1000, price: 1 }]);
    expect(await repo.getWindow("ETH", 10)).toEqual([{ t: 1000, price: 9 }]);
  });

  it("upserting an empty batch is a no-op", async () => {
    await repo.upsertPoints("BTC", []);
    expect((await repo.coverage("BTC")).count).toBe(0);
  });
});
