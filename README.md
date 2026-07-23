# Pulso

A quant finance dashboard for crypto and FX: rolling volatility, drawdown, Sharpe ratio, and cross-asset correlation, rendered on a dark instrument-panel UI with hand-rolled SVG charts. Built as a showcase of senior full-stack architecture — typed contracts end to end, three services with real boundaries instead of one blob, and a frontend with an actual point of view instead of a component-library default.

Author: Juan Cruz Maisu · MIT License

## Why three services instead of one

I split the backend into `ingestor`, `metrics`, and `gateway` because they have genuinely different failure modes and change velocities, not because "microservices" sounds impressive on a resume:

- **`ingestor`** owns the messy part: talking to flaky, rate-limited third-party APIs (CoinGecko, Frankfurter.app), persisting every series it fetches to **Postgres**, serving reads from a **Redis** hot cache, and falling back to bundled fixtures when nothing else is available. Postgres is the durable store of truth; the upstream APIs are only a refresh source. This is the I/O-bound, stateful edge of the system. If CoinGecko changes its response shape tomorrow, this is the only service that should need to change.
- **`metrics`** owns the math: log returns, rolling volatility, max drawdown, Sharpe ratio, Pearson correlation. It's pure, deterministic, and has zero knowledge of HTTP caching or upstream quirks — it just calls the ingestor over HTTP and computes. This boundary means the math is unit-testable with hand-computed fixtures, independent of network mocking.
- **`gateway`** owns the edge concerns: composing ingestor + metrics into one payload, CORS, request validation against the shared zod schemas, and mapping every failure mode to one typed error envelope. It's the only service the browser ever talks to.

The result: a bug in FX fetching can't corrupt the Sharpe ratio math, and a change to the correlation formula can't accidentally open a CORS hole. Each service can be deployed, scaled, and reasoned about independently.

## Typed contracts as the source of truth

`packages/shared` is a small TypeScript package with zod schemas for every shape that crosses a network boundary: `Asset`, `PricePoint`, `SeriesWindow`, `MetricsReport`, and a uniform `ApiResponse<T>` envelope (`{ ok: true, data } | { ok: false, error }`). Every service — ingestor, metrics, gateway, and the web app — imports these types instead of redefining them.

This buys two things: TypeScript catches contract drift at compile time (change a field name in `shared`, and every consumer fails to build until it's updated), and every HTTP boundary in the system handles success/error identically, so there's no service-specific "sometimes it's `{error: string}`, sometimes it's `{message: string}`" inconsistency.

## Architecture

```
                     ┌──────────────┐
   browser  ────────▶│   gateway    │  :4003   (CORS, validation, composition)
                     └──────┬───────┘
                            │
             ┌──────────────┴───────────────┐
             ▼                               ▼
      ┌─────────────┐                ┌──────────────┐
      │  ingestor    │  :4001         │   metrics    │  :4002
      │             │◀───────────────│  (pure math) │
      └──┬───────┬──┘   HTTP GET      └──────────────┘
         │       │      /series
 Redis ◀─┘       └─▶ Postgres
(hot cache)        (durable price history)
         ▲
         │ refresh on cache miss / stale window
         ▼
   CoinGecko / Frankfurter.app
   (bundled fixtures only if the DB is empty too)


   packages/shared ── zod schemas + types ── imported by all four services
```

The ingestor resolves a request through four tiers, cheapest first: **Redis** hot cache → **Postgres** if its stored window is fresh → **upstream API** (then persisted to Postgres and served from it) → on upstream failure, stale Postgres data if any, else bundled fixtures. Only the fixtures path is marked `isFallback: true`.

Ports: **ingestor 4001, metrics 4002, gateway 4003, web 5173**.

## Frontend

`apps/web` is React 18 + Vite + TypeScript, importing types directly from `@pulso/shared`. No UI kit, no Tailwind, no charting library — every chart (sparklines, drawdown curve, correlation heatmap) is hand-rolled SVG. The look is a dark quant-terminal instrument panel: near-black background, monospace tabular numerals for every number, hairline-bordered tile grid, one restrained accent color, muted green/red for gains/losses. Loading states are skeleton-free (a pulsing underline + em-dash placeholders), and every number is formatted through one shared `format.ts` module so sign, decimals, and separators never drift between components.

## Running it

Requires Node 18+.

```bash
npm install
npm run dev
```

This launches all three services and the web app concurrently via `concurrently`:

- ingestor → http://localhost:4001
- metrics → http://localhost:4002
- gateway → http://localhost:4003
- web → http://localhost:5173

Each service also has its own `npm run dev|build|start` (see `services/*/package.json`), so you can run any single piece in isolation — useful when iterating on one service without the whole stack.

Copy each `.env.example` to `.env`. The upstream APIs need no key (CoinGecko and Frankfurter.app are public), but the **ingestor needs a Postgres and a Redis connection string** — set `DATABASE_URL` and `REDIS_URL` in `services/ingestor/.env`. Both have free serverless tiers that work out of the box:

- **Postgres** → [Neon](https://neon.tech): create a project, copy the pooled connection string into `DATABASE_URL`. The schema is created automatically on startup.
- **Redis** → [Upstash](https://upstash.com): create a database, copy the `rediss://` TLS URL into `REDIS_URL`.

**Offline-first by design**: the durable Postgres history means the dashboard keeps working even when CoinGecko or Frankfurter rate-limit or go down — it serves the last stored window instead. If Postgres itself has no data yet (a truly cold start with a dead upstream), the ingestor falls back to bundled, realistically-generated fixture data (`services/ingestor/src/fixtures/sample-series.json`, a deterministic random-walk over 365 days per asset), so the dashboard is never blank. The header's status indicator switches from `LIVE` to `CACHED` so it's honest about which mode you're in.

## Testing

```bash
npm test
```

Runs the full metrics math test suite (hand-computed known-value fixtures — e.g. a 3-point 10%/10% series checked against `ln(1.1)` by hand, a textbook stddev example, a drawdown path with known peaks/troughs), the ingestor's Postgres repository (upsert idempotency, windowing, coverage) against an in-memory Postgres via [`pg-mem`](https://github.com/oguimbal/pg-mem), the Redis-backed cache and the four-tier resolution logic (cache → fresh DB → upstream → stale DB / fixtures) via [`ioredis-mock`](https://github.com/stipsan/ioredis-mock), and the gateway's request validation and error-mapping. **49 tests, all green** — no live database or Redis needed to run them.

## Building

```bash
npm run build
```

Builds `shared` first (everything else imports it), then each service (`tsc`), then the web app (`tsc -b && vite build`).

## Deploy notes

- **`apps/web`** → Vercel. Static Vite build, set `VITE_GATEWAY_URL` to the deployed gateway's URL.
- **`services/*`** → Railway (or any Node host). Each service is a standalone Express app; set the corresponding `.env` vars (`INGESTOR_BASE_URL`, `METRICS_BASE_URL`, `CORS_ORIGIN` for the gateway) to point at the deployed sibling services instead of localhost.
- **`ingestor`** additionally needs `DATABASE_URL` (Neon Postgres) and `REDIS_URL` (Upstash Redis). Both are free-tier serverless and reachable from Railway; the schema migrates itself on boot. The other services are stateless — the only "config" they need is which URL to call next.

## Project layout

```
pulso-quant/
├── packages/
│   └── shared/          # zod schemas + types — the contract
├── services/
│   ├── ingestor/         # fetch + Postgres persistence + Redis cache + fixtures  :4001
│   ├── metrics/           # pure math: returns, vol, drawdown, Sharpe, correlation  :4002
│   └── gateway/           # compose + validate + CORS  :4003
└── apps/
    └── web/              # React + Vite + hand-rolled SVG charts  :5173
```
