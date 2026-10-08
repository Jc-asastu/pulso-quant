import { describe, expect, it } from "vitest";
import { deriveEvents, deriveMetrics } from "./analytics";

const prices = (...values: number[]) => values.map((price, t) => ({ t, price }));
const hasNewLow = (values: number[]) =>
  deriveEvents("BTC", prices(...values)).some((event) => event.code === "NEW 30D LOW");

describe("deriveEvents new-low detection", () => {
  it("does not report a new low on flat or tied prices", () => {
    expect(hasNewLow([100, 100, 100, 100])).toBe(false);
    expect(hasNewLow([110, 100, 105, 100])).toBe(false);
  });

  it("reports a price strictly below the previous window", () => {
    expect(hasNewLow([110, 100, 105, 90])).toBe(true);
    expect(hasNewLow([1, ...Array(29).fill(100), 90])).toBe(true);
  });

  it("does not report a low without enough prior points", () => {
    expect(hasNewLow([100, 90])).toBe(false);
  });
});

describe("volatility percentile ties", () => {
  it("does not classify a flat market as high volatility", () => {
    const points = prices(...Array(20).fill(100));
    const metrics = deriveMetrics(points);

    expect(metrics.volatility).toBe(0);
    expect(metrics.volatilityPercentile).toBe(50);
    expect(metrics.regime).not.toBe("HIGH");
    expect(deriveEvents("BTC", points).some((event) => event.code === "VOL REGIME SHIFT")).toBe(false);
  });

  it("still detects a current volatility spike above the previous windows", () => {
    const points = prices(...Array(20).fill(100), 120);
    const metrics = deriveMetrics(points);

    expect(metrics.volatility).toBeGreaterThan(0);
    expect(metrics.volatilityPercentile).toBeGreaterThanOrEqual(80);
    expect(metrics.regime).toBe("HIGH");
    expect(deriveEvents("BTC", points).some((event) => event.code === "VOL REGIME SHIFT")).toBe(true);
  });
});
