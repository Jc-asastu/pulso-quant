import type { PricePoint } from "@pulso/shared";

const TRADING_DAYS_PER_YEAR = 365;
const ROLLING_WINDOW_DAYS = 14;

/**
 * Daily log returns: ln(p[i] / p[i-1]) for i = 1..n-1.
 * Length is points.length - 1 (or 0 if fewer than 2 points).
 */
export function dailyLogReturns(points: readonly PricePoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.price;
    const curr = points[i]!.price;
    if (prev <= 0 || curr <= 0) {
      returns.push(0);
      continue;
    }
    returns.push(Math.log(curr / prev));
  }
  return returns;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1 denominator). Returns 0 for < 2 samples. */
export function stdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Annualized rolling volatility over a trailing window of `windowDays`
 * daily log returns, expressed as a fraction (e.g. 0.65 = 65%/yr).
 * One output value per return index where a full window is available
 * (i.e. output is shorter than the input by windowDays - 1), timestamped
 * to the price point the window ends on.
 */
export function rollingVolatility(
  points: readonly PricePoint[],
  windowDays: number = ROLLING_WINDOW_DAYS,
): { t: number; value: number }[] {
  const returns = dailyLogReturns(points);
  const out: { t: number; value: number }[] = [];
  for (let i = windowDays - 1; i < returns.length; i++) {
    const window = returns.slice(i - windowDays + 1, i + 1);
    const dailyVol = stdDev(window);
    const annualized = dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
    // returns[i] is the return ending at points[i+1]
    const point = points[i + 1];
    if (point) out.push({ t: point.t, value: annualized });
  }
  return out;
}

/**
 * Drawdown curve: at each point, the fractional distance below the running
 * peak observed so far (<= 0). E.g. -0.2 means 20% below peak.
 */
export function drawdownCurve(points: readonly PricePoint[]): { t: number; value: number }[] {
  let peak = -Infinity;
  return points.map((p) => {
    peak = Math.max(peak, p.price);
    const value = peak > 0 ? p.price / peak - 1 : 0;
    return { t: p.t, value };
  });
}

/** Maximum drawdown across the series: the most negative point of the drawdown curve. */
export function maxDrawdown(points: readonly PricePoint[]): number {
  const curve = drawdownCurve(points);
  if (curve.length === 0) return 0;
  return Math.min(...curve.map((c) => c.value));
}

/**
 * Annualized Sharpe ratio with risk-free rate = 0:
 * (mean daily log return / stddev of daily log returns) * sqrt(365).
 * Returns 0 if there's no variance (flat or insufficient data) to avoid
 * dividing by zero / producing Infinity.
 */
export function sharpeRatio(points: readonly PricePoint[]): number {
  const returns = dailyLogReturns(points);
  const sd = stdDev(returns);
  if (sd === 0) return 0;
  return (mean(returns) / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Total return over the window as a fraction: last/first - 1. */
export function windowReturn(points: readonly PricePoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0]!.price;
  const last = points[points.length - 1]!.price;
  if (first === 0) return 0;
  return last / first - 1;
}

/**
 * Pearson correlation coefficient between two equal-length numeric series.
 * Returns 0 if either series has zero variance or lengths mismatch/are too short.
 */
export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const xs = a.slice(0, n);
  const ys = b.slice(0, n);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dxSq = 0;
  let dySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    num += dx * dy;
    dxSq += dx * dx;
    dySq += dy * dy;
  }
  const denom = Math.sqrt(dxSq * dySq);
  if (denom === 0) return 0;
  return num / denom;
}

/**
 * Builds a correlation matrix over daily log returns for a set of aligned
 * series (same asset order in `seriesByAsset`). Returns matrix[i][j] =
 * correlation(returns[i], returns[j]); diagonal is always 1.
 */
export function correlationMatrix(returnsByAsset: readonly number[][]): number[][] {
  const n = returnsByAsset.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i]![j] = 1;
      } else if (j < i) {
        matrix[i]![j] = matrix[j]![i]!;
      } else {
        matrix[i]![j] = pearsonCorrelation(returnsByAsset[i]!, returnsByAsset[j]!);
      }
    }
  }
  return matrix;
}
