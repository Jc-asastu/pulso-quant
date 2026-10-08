import type { AssetId, PricePoint } from "@pulso/shared";

export interface DerivedMetrics {
  simpleReturns: number[];
  logReturns: number[];
  volatility: number | null;
  volatilityDelta30: number | null;
  volatilityPercentile: number | null;
  sharpe: number | null;
  sortino: number | null;
  var95: number | null;
  expectedShortfall: number | null;
  maxDrawdown: number | null;
  drawdownCurve: { t: number; value: number }[];
  drawdownDuration: number | null;
  beta: number | null;
  correlation: number | null;
  momentum: number | null;
  zScore: number | null;
  distanceToHigh: number | null;
  liquidityProxy: number | null;
  riskScore: number | null;
  regime: "HIGH" | "ELEVATED" | "NORMAL" | "LOW" | "N/A";
}

export interface MarketEvent {
  id: string;
  t: number;
  asset: AssetId;
  type: "risk" | "warning" | "recovery" | "data";
  code: string;
  detail: string;
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? null;
  const weight = position - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

export function correlation(a: readonly number[], b: readonly number[]): number | null {
  const length = Math.min(a.length, b.length);
  if (length < 3) return null;
  const left = a.slice(-length);
  const right = b.slice(-length);
  const leftMean = mean(left);
  const rightMean = mean(right);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const dx = (left[index] ?? 0) - leftMean;
    const dy = (right[index] ?? 0) - rightMean;
    covariance += dx * dy;
    leftVariance += dx * dx;
    rightVariance += dy * dy;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator ? covariance / denominator : null;
}

function rollingVolatility(logReturns: readonly number[], window = 14): number[] {
  if (logReturns.length < window) return [];
  const values: number[] = [];
  for (let index = window; index <= logReturns.length; index += 1) {
    values.push(stdDev(logReturns.slice(index - window, index)) * Math.sqrt(365));
  }
  return values;
}

function betaAgainst(assetReturns: readonly number[], benchmarkReturns: readonly number[]): number | null {
  const length = Math.min(assetReturns.length, benchmarkReturns.length);
  if (length < 3) return null;
  const asset = assetReturns.slice(-length);
  const benchmark = benchmarkReturns.slice(-length);
  const assetMean = mean(asset);
  const benchmarkMean = mean(benchmark);
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < length; index += 1) {
    covariance += ((asset[index] ?? 0) - assetMean) * ((benchmark[index] ?? 0) - benchmarkMean);
    variance += ((benchmark[index] ?? 0) - benchmarkMean) ** 2;
  }
  return variance ? covariance / variance : null;
}

export function deriveMetrics(points: readonly PricePoint[], benchmark?: readonly PricePoint[]): DerivedMetrics {
  const simpleReturns: number[] = [];
  const logReturns: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]?.price ?? 0;
    const current = points[index]?.price ?? 0;
    if (previous > 0 && current > 0) {
      simpleReturns.push(current / previous - 1);
      logReturns.push(Math.log(current / previous));
    }
  }

  const volatilitySeries = rollingVolatility(logReturns);
  const volatility = volatilitySeries.at(-1) ?? null;
  const previousVolatility = volatilitySeries.length > 1
    ? mean(volatilitySeries.slice(Math.max(0, volatilitySeries.length - 31), -1))
    : null;
  const volatilityDelta30 = volatility !== null && previousVolatility !== null ? volatility - previousVolatility : null;
  const volatilityPercentile = volatility === null || !volatilitySeries.length
    ? null
    : ((volatilitySeries.filter((value) => value < volatility).length
      + volatilitySeries.filter((value) => value === volatility).length / 2)
      / volatilitySeries.length) * 100;
  const returnMean = mean(logReturns);
  const returnDeviation = stdDev(logReturns);
  const sharpe = logReturns.length >= 3 && returnDeviation > 0
    ? (returnMean / returnDeviation) * Math.sqrt(365)
    : null;
  const downside = logReturns.filter((value) => value < 0);
  const downsideDeviation = downside.length ? Math.sqrt(mean(downside.map((value) => value ** 2))) : 0;
  const sortino = logReturns.length >= 3 && downsideDeviation > 0
    ? (returnMean / downsideDeviation) * Math.sqrt(365)
    : null;
  const var95 = simpleReturns.length >= 10 ? percentile(simpleReturns, 0.05) : null;
  const tail = var95 === null ? [] : simpleReturns.filter((value) => value <= var95);
  const expectedShortfall = tail.length ? mean(tail) : null;

  let peak = Number.NEGATIVE_INFINITY;
  let longestDuration = 0;
  let currentDuration = 0;
  const drawdownCurve = points.map((point) => {
    if (point.price >= peak) {
      peak = point.price;
      currentDuration = 0;
    } else {
      currentDuration += 1;
      longestDuration = Math.max(longestDuration, currentDuration);
    }
    return { t: point.t, value: peak > 0 ? point.price / peak - 1 : 0 };
  });
  const maxDrawdown = drawdownCurve.length ? Math.min(...drawdownCurve.map((point) => point.value)) : null;
  const latest = points.at(-1)?.price;
  const high = points.length ? Math.max(...points.map((point) => point.price)) : undefined;
  const lookback = Math.min(20, Math.max(1, points.length - 1));
  const momentumBase = points.at(-(lookback + 1))?.price;
  const prices = points.slice(-Math.min(points.length, 30)).map((point) => point.price);
  const priceDeviation = stdDev(prices);
  const zScore = latest !== undefined && prices.length >= 3 && priceDeviation > 0
    ? (latest - mean(prices)) / priceDeviation
    : null;
  const momentum = latest !== undefined && momentumBase
    ? latest / momentumBase - 1
    : null;
  const distanceToHigh = latest !== undefined && high ? latest / high - 1 : null;
  const medianAbsReturn = percentile(simpleReturns.map(Math.abs), 0.5);
  const liquidityProxy = simpleReturns.length && medianAbsReturn && medianAbsReturn > 0
    ? Math.abs(simpleReturns.at(-1) ?? 0) / medianAbsReturn
    : null;

  const benchmarkLogReturns = benchmark ? benchmark.slice(1).map((point, index) => {
    const previous = benchmark[index]?.price ?? 0;
    return previous > 0 && point.price > 0 ? Math.log(point.price / previous) : 0;
  }) : [];
  const beta = benchmark ? betaAgainst(logReturns, benchmarkLogReturns) : null;
  const correlationValue = benchmark ? correlation(logReturns, benchmarkLogReturns) : null;
  const regime = volatilityPercentile === null
    ? "N/A"
    : volatilityPercentile >= 80
      ? "HIGH"
      : volatilityPercentile >= 60
        ? "ELEVATED"
        : volatilityPercentile <= 25
          ? "LOW"
          : "NORMAL";
  const riskScore = volatilityPercentile === null || maxDrawdown === null
    ? null
    : Math.min(100, Math.max(0,
      volatilityPercentile * 0.42
      + Math.min(Math.abs(maxDrawdown) * 200, 100) * 0.26
      + Math.min(Math.abs(expectedShortfall ?? 0) * 1000, 100) * 0.18
      + Math.min(Math.abs(zScore ?? 0) * 28, 100) * 0.14,
    ));

  return {
    simpleReturns,
    logReturns,
    volatility,
    volatilityDelta30,
    volatilityPercentile,
    sharpe,
    sortino,
    var95,
    expectedShortfall,
    maxDrawdown,
    drawdownCurve,
    drawdownDuration: drawdownCurve.length ? longestDuration : null,
    beta,
    correlation: correlationValue,
    momentum,
    zScore,
    distanceToHigh,
    liquidityProxy,
    riskScore,
    regime,
  };
}

export function deriveEvents(asset: AssetId, points: readonly PricePoint[]): MarketEvent[] {
  if (points.length < 3) return [];
  const metrics = deriveMetrics(points);
  const events: MarketEvent[] = [];
  const returns = metrics.simpleReturns;
  const returnDeviation = stdDev(returns);
  const latestReturn = returns.at(-1) ?? 0;
  const latestPoint = points.at(-1)!;
  const previousDrawdown = metrics.drawdownCurve.at(-2)?.value ?? 0;
  const latestDrawdown = metrics.drawdownCurve.at(-1)?.value ?? 0;

  if (returnDeviation > 0 && Math.abs(latestReturn) >= returnDeviation * 3) {
    events.push({ id: `${asset}-sigma`, t: latestPoint.t, asset, type: "risk", code: "3σ RETURN EVENT", detail: `${(latestReturn * 100).toFixed(2)}% / σ ${(returnDeviation * 100).toFixed(2)}%` });
  }
  if (metrics.volatilityPercentile !== null && metrics.volatilityPercentile >= 80) {
    events.push({ id: `${asset}-vol`, t: latestPoint.t, asset, type: "warning", code: "VOL REGIME SHIFT", detail: `PCTL ${metrics.volatilityPercentile.toFixed(0)} · HIGH` });
  }
  const priorLow = Math.min(...points.slice(-30, -1).map((point) => point.price));
  if (latestPoint.price < priorLow) {
    events.push({ id: `${asset}-low`, t: latestPoint.t, asset, type: "risk", code: "NEW 30D LOW", detail: `${latestPoint.price.toFixed(latestPoint.price >= 100 ? 2 : 4)}` });
  }
  if (previousDrawdown < 0 && latestDrawdown === 0) {
    events.push({ id: `${asset}-recovery`, t: latestPoint.t, asset, type: "recovery", code: "DRAWDOWN RECOVERY", detail: "RUNNING HIGH RESTORED" });
  }
  return events;
}

export function normalizeSeries(points: readonly PricePoint[]): { t: number; value: number }[] {
  const first = points[0]?.price;
  if (!first) return [];
  return points.map((point) => ({ t: point.t, value: point.price / first - 1 }));
}
