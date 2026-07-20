import type { AssetMetrics, MetricsReport, SeriesWindow } from "@pulso/shared";
import {
  dailyLogReturns,
  rollingVolatility,
  drawdownCurve,
  maxDrawdown,
  sharpeRatio,
  windowReturn,
  correlationMatrix,
} from "./math.js";

function buildAssetMetrics(series: SeriesWindow): AssetMetrics {
  const { points, asset } = series;
  const lastPrice = points.length > 0 ? points[points.length - 1]!.price : 0;
  return {
    asset,
    returns: dailyLogReturns(points),
    rollingVolatility: rollingVolatility(points),
    maxDrawdown: maxDrawdown(points),
    drawdownCurve: drawdownCurve(points),
    sharpe: sharpeRatio(points),
    lastPrice,
    windowReturn: windowReturn(points),
  };
}

/** Builds the full MetricsReport from a set of aligned SeriesWindows. */
export function buildMetricsReport(seriesList: SeriesWindow[], days: number): MetricsReport {
  const perAsset = seriesList.map(buildAssetMetrics);
  const returnsByAsset = seriesList.map((s) => dailyLogReturns(s.points));
  const matrix = correlationMatrix(returnsByAsset);

  return {
    days,
    generatedAt: new Date().toISOString(),
    perAsset,
    correlation: {
      assets: seriesList.map((s) => s.asset),
      matrix,
    },
  };
}
