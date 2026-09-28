import { describe, it, expect } from "vitest";
import type { PricePoint } from "@pulso/shared";
import {
  dailyLogReturns,
  mean,
  stdDev,
  rollingVolatility,
  drawdownCurve,
  maxDrawdown,
  sharpeRatio,
  windowReturn,
  pearsonCorrelation,
  correlationMatrix,
} from "./math.js";

const DAY = 24 * 60 * 60 * 1000;
function series(prices: number[], startT = 0): PricePoint[] {
  return prices.map((price, i) => ({ t: startT + i * DAY, price }));
}

describe("dailyLogReturns", () => {
  it("computes ln(p1/p0) for a simple two-point series", () => {
    const pts = series([100, 110]);
    const r = dailyLogReturns(pts);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(Math.log(1.1), 10); // 0.0953101798...
  });

  it("matches hand-computed values for a 3-point 10%/10% series", () => {
    const pts = series([100, 110, 121]);
    const r = dailyLogReturns(pts);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.09531017980432486, 12);
    expect(r[1]).toBeCloseTo(0.09531017980432486, 12);
  });

  it("returns an empty array for a single point", () => {
    expect(dailyLogReturns(series([100]))).toEqual([]);
  });

  it("returns an empty array for zero points", () => {
    expect(dailyLogReturns([])).toEqual([]);
  });
});

describe("mean", () => {
  it("computes the arithmetic mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns 0 for an empty array", () => {
    expect(mean([])).toBe(0);
  });
});

describe("stdDev", () => {
  it("matches hand-computed sample stddev for [2, 4, 4, 4, 5, 5, 7, 9]", () => {
    // classic textbook example: mean=5, sample variance=4.571428..., sd=2.13809...
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(stdDev(xs)).toBeCloseTo(2.1380899352993947, 10);
  });

  it("returns 0 for fewer than 2 samples", () => {
    expect(stdDev([5])).toBe(0);
    expect(stdDev([])).toBe(0);
  });

  it("returns 0 for a constant series", () => {
    expect(stdDev([3, 3, 3, 3])).toBe(0);
  });
});

describe("windowReturn", () => {
  it("computes total return as last/first - 1", () => {
    expect(windowReturn(series([100, 150]))).toBeCloseTo(0.5, 10);
    expect(windowReturn(series([200, 150]))).toBeCloseTo(-0.25, 10);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(windowReturn(series([100]))).toBe(0);
    expect(windowReturn([])).toBe(0);
  });
});

describe("drawdownCurve / maxDrawdown", () => {
  it("tracks distance below running peak for a known path", () => {
    // Peaks at 100, drops to 80 (-20%), recovers to 90 (-10%), new peak 120 (0%), drops to 60 (-50%)
    const pts = series([100, 80, 90, 120, 60]);
    const curve = drawdownCurve(pts);
    const values = curve.map((c) => c.value);
    expect(values).toHaveLength(5);
    expect(values[0]).toBeCloseTo(0, 10);
    expect(values[1]).toBeCloseTo(-0.2, 10);
    expect(values[2]).toBeCloseTo(-0.1, 10);
    expect(values[3]).toBeCloseTo(0, 10);
    expect(values[4]).toBeCloseTo(-0.5, 10);
    expect(maxDrawdown(pts)).toBeCloseTo(-0.5, 10);
  });

  it("returns 0 max drawdown for a monotonically increasing series", () => {
    expect(maxDrawdown(series([10, 20, 30]))).toBe(0);
  });

  it("returns 0 for an empty series", () => {
    expect(maxDrawdown([])).toBe(0);
  });
});

describe("sharpeRatio", () => {
  it("returns 0 for a flat (zero-variance) series", () => {
    expect(sharpeRatio(series([100, 100, 100, 100]))).toBe(0);
  });

  it("is positive for a steadily rising series", () => {
    expect(sharpeRatio(series([100, 105, 110, 116, 122]))).toBeGreaterThan(0);
  });

  it("is negative for a steadily falling series", () => {
    expect(sharpeRatio(series([100, 95, 90, 84, 78]))).toBeLessThan(0);
  });
});

describe("rollingVolatility", () => {
  it("produces one point per return once the window is full", () => {
    // 20 prices -> 19 returns -> window 14 -> 19-14+1 = 6 output points
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const pts = series(prices);
    const vol = rollingVolatility(pts, 14);
    expect(vol).toHaveLength(6);
    vol.forEach((v) => expect(v.value).toBeGreaterThanOrEqual(0));
  });

  it("returns an empty array when there are fewer returns than the window", () => {
    const pts = series([100, 101, 102]);
    expect(rollingVolatility(pts, 14)).toEqual([]);
  });
});

describe("pearsonCorrelation", () => {
  it("is 1 for perfectly correlated series", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1, 10);
  });

  it("is -1 for perfectly anti-correlated series", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(-1, 10);
  });

  it("is 0 for a series with no linear trend against a monotone series", () => {
    // b is symmetric around its mean with no linear relationship to a's
    // steady increase: sum((a-mean(a))*(b-mean(b))) = 0 exactly.
    const a = [1, 2, 3, 4, 5];
    const b = [1, -1, 0, -1, 1];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(0, 10);
  });

  it("returns 0 when one series has zero variance", () => {
    expect(pearsonCorrelation([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it("returns 0 rather than truncating series of different lengths", () => {
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6, 8])).toBe(0);
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6])).toBe(0);
  });
});

describe("correlationMatrix", () => {
  it("has 1s on the diagonal and is symmetric", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    const c = [1, 3, 2, 5, 4];
    const m = correlationMatrix([a, b, c]);
    expect(m[0]![0]).toBeCloseTo(1, 10);
    expect(m[1]![1]).toBeCloseTo(1, 10);
    expect(m[2]![2]).toBeCloseTo(1, 10);
    expect(m[0]![1]).toBeCloseTo(m[1]![0]!, 10);
    expect(m[0]![2]).toBeCloseTo(m[2]![0]!, 10);
    expect(m[1]![2]).toBeCloseTo(m[2]![1]!, 10);
  });

  it("matches direct pairwise correlation values", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    const m = correlationMatrix([a, b]);
    expect(m[0]![1]).toBeCloseTo(pearsonCorrelation(a, b), 10);
  });
});
