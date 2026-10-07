import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCoingeckoSeries } from "./coingecko.js";

function stubPrices(prices: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ prices }),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchCoingeckoSeries", () => {
  it("returns valid price points unchanged", async () => {
    stubPrices([[1000, 42.5], [2000, 43]]);

    await expect(fetchCoingeckoSeries("bitcoin", 2)).resolves.toEqual([
      { t: 1000, price: 42.5 },
      { t: 2000, price: 43 },
    ]);
  });

  it("rejects a malformed nested price before it reaches persistence", async () => {
    stubPrices([[1000, "bad"]]);

    await expect(fetchCoingeckoSeries("bitcoin", 1)).rejects.toThrow();
  });
});
