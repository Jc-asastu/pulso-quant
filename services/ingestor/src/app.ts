import express, { type Request, type Response } from "express";
import cors from "cors";
import { AssetIdSchema, ok, err, type AssetId } from "@pulso/shared";
import { getSeries } from "./series-service.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json(ok({ status: "up", service: "ingestor" }));
  });

  app.get("/series", async (req: Request, res: Response) => {
    const assetsParam = String(req.query.assets ?? "");
    const daysParam = Number(req.query.days ?? 90);

    if (!assetsParam) {
      res.status(400).json(err("BAD_REQUEST", "query param 'assets' is required (comma-separated)"));
      return;
    }
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

    try {
      const series = await Promise.all(assetIds.map((a) => getSeries(a, daysParam)));
      res.json(ok(series));
    } catch (e) {
      res.status(500).json(err("INTERNAL_ERROR", e instanceof Error ? e.message : "unknown error"));
    }
  });

  return app;
}
