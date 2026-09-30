import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  AssetIdSchema,
  ASSET_CATALOG,
  ok,
  err,
  type AssetId,
  type DashboardResponse,
} from "@pulso/shared";
import { fetchSeries, fetchMetrics } from "./clients.js";
import { config } from "./config.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json(ok({ status: "up", service: "gateway" }));
  });

  app.get("/api/dashboard", async (req: Request, res: Response) => {
    const assetsParam = String(req.query.assets ?? config.defaultAssets.join(","));
    const daysParam = Number(req.query.days ?? config.defaultDays);

    if (!Number.isInteger(daysParam) || daysParam <= 0 || daysParam > 365) {
      res.status(400).json(err("BAD_REQUEST", "query param 'days' must be an integer between 1 and 365"));
      return;
    }

    const requested = assetsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const assetIds: AssetId[] = [];
    for (const a of requested) {
      const parsed = AssetIdSchema.safeParse(a);
      if (!parsed.success) {
        res.status(400).json(err("BAD_REQUEST", `unknown asset id: ${a}`));
        return;
      }
      assetIds.push(parsed.data);
    }
    if (assetIds.length === 0) {
      res.status(400).json(err("BAD_REQUEST", "at least one asset must be requested"));
      return;
    }

    try {
      const [series, metrics] = await Promise.all([
        fetchSeries(assetIds, daysParam),
        fetchMetrics(assetIds, daysParam),
      ]);

      const response: DashboardResponse = {
        days: daysParam,
        generatedAt: new Date().toISOString(),
        assets: assetIds.map((id) => ASSET_CATALOG[id]),
        series,
        metrics,
        isFallback: series.some((s) => s.isFallback),
      };

      res.json(ok(response));
    } catch (e) {
      res
        .status(502)
        .json(err("UPSTREAM_ERROR", e instanceof Error ? e.message : "unknown upstream error"));
    }
  });

  return app;
}
