import { z } from "zod";
import { AssetIdSchema } from "./assets.js";

export const AssetMetricsSchema = z.object({
  asset: AssetIdSchema,
  /** Daily log returns, aligned 1:1 with input points minus the first. */
  returns: z.array(z.number().finite()),
  /** Annualized rolling volatility, one value per day (NaN-free, window-trimmed). */
  rollingVolatility: z.array(
    z.object({ t: z.number().int().nonnegative(), value: z.number().finite() }),
  ),
  /** Max drawdown as a negative fraction, e.g. -0.42 for a 42% peak-to-trough drop. */
  maxDrawdown: z.number(),
  /** Drawdown curve: fraction below running peak at each point, <= 0. */
  drawdownCurve: z.array(
    z.object({ t: z.number().int().nonnegative(), value: z.number().finite() }),
  ),
  /** Annualized Sharpe ratio, risk-free rate = 0. */
  sharpe: z.number(),
  /** Latest price. */
  lastPrice: z.number(),
  /** Total return over the window, as a fraction. */
  windowReturn: z.number(),
});
export type AssetMetrics = z.infer<typeof AssetMetricsSchema>;

export const CorrelationMatrixSchema = z.object({
  assets: z.array(AssetIdSchema),
  /** Row-major matrix, matrix[i][j] = correlation(assets[i], assets[j]). */
  matrix: z.array(z.array(z.number())),
});
export type CorrelationMatrix = z.infer<typeof CorrelationMatrixSchema>;

export const MetricsReportSchema = z.object({
  days: z.number().int().positive(),
  generatedAt: z.string(),
  perAsset: z.array(AssetMetricsSchema),
  correlation: CorrelationMatrixSchema,
});
export type MetricsReport = z.infer<typeof MetricsReportSchema>;
