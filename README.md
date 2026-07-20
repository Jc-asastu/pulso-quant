# Pulso

A quant finance dashboard for crypto and FX: rolling volatility, drawdown, Sharpe ratio, and cross-asset correlation, rendered on a dark instrument-panel UI with hand-rolled SVG charts. Built as a showcase of senior full-stack architecture — typed contracts end to end, three services with real boundaries instead of one blob, and a frontend with an actual point of view instead of a component-library default.

Author: Juan Cruz Maisu · MIT License

## Why three services instead of one

I split the backend into `ingestor`, `metrics`, and `gateway` because they have genuinely different failure modes and change velocities, not because "microservices" sounds impressive on a resume:

- **`ingestor`** owns the messy part: talking to flaky, rate-limited third-party APIs (CoinGecko, Frankfurter.app), caching responses, and falling back to bundled fixtures when the internet doesn't cooperate. This is I/O-bound and stateful (in-memory TTL cache). If CoinGecko changes its response shape tomorrow, this is the only file that should need to change.
- **`metrics`** owns the math: log returns, rolling volatility, max drawdown, Sharpe ratio, Pearson correlation. It's pure, deterministic, and has zero knowledge of HTTP caching or upstream quirks — it just calls the ingestor over HTTP and computes. This boundary means the math is unit-testable with hand-computed fixtures, independent of network mocking.
- **`gateway`** owns the edge concerns: composing ingestor + metrics into one payload, CORS, request validation against the shared zod schemas, and mapping every failure mode to one typed error envelope. It's the only service the browser ever talks to.

The result: a bug in FX fetching can't corrupt the Sharpe ratio math, and a change to the correlation formula can't accidentally open a CORS hole. Each service can be deployed, scaled, and reasoned about independently.

## Typed contracts as the source of truth

`packages/shared` is a small TypeScript package with zod schemas for every shape that crosses a network boundary: `Asset`, `PricePoint`, `SeriesWindow`, `MetricsReport`, and a uniform `ApiResponse<T>` envelope (`{ ok: true, data } | { ok: false, error }`). Every service — ingestor, metrics, gateway, and the web app — imports these types instead of redefining them.

This buys two things: TypeScript catches contract drift at compile time (change a field name in `shared`, and every consumer fails to build until it's updated), and every HTTP boundary in the system handles success/error identically, so there's no service-specific "sometimes it's `{error: string}`, sometimes it's `{message: string}`" inconsistency.

## Architecture

```
                    ┌──────────────┐
   browser  ───────▶│   gateway    │  :4003   (CORS, validation, composition)
                    └──────┬───────┘
                           │
            ┌──────────────┴───────────────┐
            ▼                               ▼
     ┌─────────────┐                ┌──────────────┐
     │  ingestor    │  :4001         │   metrics    │  :4002
     │  (cache +    │◀───────────────│  (pure math) │
     │   fallback)  │   HTTP GET     └──────────────┘
     └──────┬───────┘   /series
            │
            ▼
   CoinGecko / Frankfurter.app
   (fixtures on failure/rate-limit)


   packages/shared ── zod schemas + types ── imported by all four services
```

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

Copy each `.env.example` to `.env` if you want to override defaults (ports, upstream URLs, cache TTL). Nothing requires an API key — CoinGecko and Frankfurter.app are both public, unauthenticated APIs.

**Offline-first by design**: if CoinGecko or Frankfurter rate-limit or are unreachable, the ingestor transparently falls back to bundled, realistically-generated fixture data (`services/ingestor/src/fixtures/sample-series.json`, a deterministic random-walk over 365 days per asset). The dashboard is always fully functional, even with no network access — the header's status indicator switches from `LIVE` to `CACHED` so it's honest about which mode you're in.

## Testing

```bash
npm test
```

Runs the full metrics math test suite (hand-computed known-value fixtures — e.g. a 3-point 10%/10% series checked against `ln(1.1)` by hand, a textbook stddev example, a drawdown path with known peaks/troughs) plus the ingestor's cache TTL logic (fake timers, boundary conditions) and series/fallback behavior, plus the gateway's request validation and error-mapping tests. 39 tests, all green.

## Building

```bash
npm run build
```

Builds `shared` first (everything else imports it), then each service (`tsc`), then the web app (`tsc -b && vite build`).

## Deploy notes

- **`apps/web`** → Vercel. Static Vite build, set `VITE_GATEWAY_URL` to the deployed gateway's URL.
- **`services/*`** → Railway (or any Node host). Each service is a standalone Express app; set the corresponding `.env` vars (`INGESTOR_BASE_URL`, `METRICS_BASE_URL`, `CORS_ORIGIN` for the gateway) to point at the deployed sibling services instead of localhost.
- Nothing here needs a database or secrets — the only "config" is which URL each service should call next.

## Project layout

```
pulso-quant/
├── packages/
│   └── shared/          # zod schemas + types — the contract
├── services/
│   ├── ingestor/         # fetch + cache + fixture fallback  :4001
│   ├── metrics/           # pure math: returns, vol, drawdown, Sharpe, correlation  :4002
│   └── gateway/           # compose + validate + CORS  :4003
└── apps/
    └── web/              # React + Vite + hand-rolled SVG charts  :5173
```
