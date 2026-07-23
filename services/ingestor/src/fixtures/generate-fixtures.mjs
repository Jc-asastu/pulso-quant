// One-off script to (re)generate deterministic fixture JSON files.
// Run manually with: node src/fixtures/generate-fixtures.mjs
// Not part of the build/runtime — fixtures are committed as static JSON.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple deterministic PRNG (mulberry32) so fixtures are reproducible.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genSeries({ seed, days, start, driftPerDay, volPerDay }) {
  const rand = mulberry32(seed);
  const now = Date.UTC(2026, 6, 20); // 2026-07-20, aligned with "today" for this project
  const dayMs = 24 * 60 * 60 * 1000;
  const points = [];
  let price = start;
  for (let i = days - 1; i >= 0; i--) {
    const t = now - i * dayMs;
    // Box-Muller for approx-normal noise
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const dailyReturn = driftPerDay + volPerDay * z;
    if (i !== days - 1) {
      price = price * (1 + dailyReturn);
    }
    points.push({ t, price: Math.round(price * 100) / 100 });
  }
  return points;
}

const MAX_DAYS = 365;

const specs = {
  BTC: { seed: 1001, start: 42000, driftPerDay: 0.0015, volPerDay: 0.028 },
  ETH: { seed: 1002, start: 2200, driftPerDay: 0.0012, volPerDay: 0.032 },
  SOL: { seed: 1003, start: 95, driftPerDay: 0.002, volPerDay: 0.045 },
  XRP: { seed: 1004, start: 0.52, driftPerDay: 0.0016, volPerDay: 0.045 },
  LINK: { seed: 1005, start: 13.5, driftPerDay: 0.0015, volPerDay: 0.05 },
  BNB: { seed: 1006, start: 300, driftPerDay: 0.0013, volPerDay: 0.03 },
};

const out = {};
for (const [asset, spec] of Object.entries(specs)) {
  out[asset] = genSeries({ ...spec, days: MAX_DAYS });
}

const outPath = join(__dirname, "sample-series.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote fixtures for ${Object.keys(out).length} assets to ${outPath}`);
