import { z } from "zod";

/**
 * The universe of assets Pulso tracks. Kept as a closed set (rather than a
 * free-form string) so the front end, ingestor, and metrics service all
 * agree on what's valid without a round trip.
 */
export const ASSET_IDS = ["BTC", "ETH", "SOL", "XRP", "LINK", "BNB"] as const;

export const AssetIdSchema = z.enum(ASSET_IDS);
export type AssetId = z.infer<typeof AssetIdSchema>;

export const ASSET_KIND = ["crypto", "fx"] as const;
export const AssetKindSchema = z.enum(ASSET_KIND);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: AssetIdSchema,
  label: z.string(),
  kind: AssetKindSchema,
  /** Source-specific identifier, e.g. CoinGecko coin id or Frankfurter pair. */
  sourceId: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const ASSET_CATALOG: Record<AssetId, Asset> = {
  BTC: { id: "BTC", label: "Bitcoin", kind: "crypto", sourceId: "bitcoin" },
  ETH: { id: "ETH", label: "Ethereum", kind: "crypto", sourceId: "ethereum" },
  SOL: { id: "SOL", label: "Solana", kind: "crypto", sourceId: "solana" },
  XRP: { id: "XRP", label: "XRP", kind: "crypto", sourceId: "ripple" },
  LINK: { id: "LINK", label: "Chainlink", kind: "crypto", sourceId: "chainlink" },
  BNB: { id: "BNB", label: "BNB", kind: "crypto", sourceId: "binancecoin" },
};
