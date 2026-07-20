import { z } from "zod";
import { AssetIdSchema } from "./assets.js";

export const PricePointSchema = z.object({
  /** Unix ms timestamp, UTC midnight-aligned for daily series. */
  t: z.number().int().nonnegative(),
  /** Close price for the day, in the asset's natural quote currency. */
  price: z.number().finite(),
});
export type PricePoint = z.infer<typeof PricePointSchema>;

export const SeriesWindowSchema = z.object({
  asset: AssetIdSchema,
  days: z.number().int().positive(),
  points: z.array(PricePointSchema),
  /** True if this series came from bundled fixtures rather than a live API. */
  isFallback: z.boolean(),
  /** ISO timestamp of when this series was produced/cached. */
  fetchedAt: z.string(),
});
export type SeriesWindow = z.infer<typeof SeriesWindowSchema>;
