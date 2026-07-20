import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AssetId, PricePoint } from "@pulso/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

type FixtureFile = Record<string, PricePoint[]>;

let cached: FixtureFile | undefined;

function loadFixtures(): FixtureFile {
  if (!cached) {
    const raw = readFileSync(join(__dirname, "fixtures", "sample-series.json"), "utf-8");
    cached = JSON.parse(raw) as FixtureFile;
  }
  return cached;
}

/** Returns the last `days` fixture points for an asset. Always succeeds. */
export function getFixtureSeries(asset: AssetId, days: number): PricePoint[] {
  const fixtures = loadFixtures();
  const series = fixtures[asset] ?? [];
  return series.slice(Math.max(0, series.length - days));
}
