import { z } from "zod";
import { AssetSchema } from "./assets.js";
import { SeriesWindowSchema } from "./series.js";
import { MetricsReportSchema } from "./metrics.js";

/**
 * The single payload the gateway hands to the web app: composed series +
 * metrics + asset catalog metadata, so the front never needs to call
 * more than one endpoint.
 */
export const DashboardResponseSchema = z.object({
  days: z.number().int().positive(),
  generatedAt: z.string(),
  assets: z.array(AssetSchema),
  series: z.array(SeriesWindowSchema),
  metrics: MetricsReportSchema,
  isFallback: z.boolean(),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
