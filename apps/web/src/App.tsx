import { useMemo, useState } from "react";
import type { AssetId } from "@pulso/shared";
import { Header } from "./components/Header";
import { Controls } from "./components/Controls";
import { MetricTile } from "./components/MetricTile";
import { TapeRow } from "./components/TapeRow";
import { CorrelationHeatmap } from "./components/CorrelationHeatmap";
import { DrawdownChart } from "./components/DrawdownChart";
import { useDashboard } from "./lib/useDashboard";
import { formatPercent, formatNumber, signClass } from "./lib/format";

const DEFAULT_ASSETS: AssetId[] = ["BTC", "ETH", "SOL", "EURUSD", "USDJPY", "USDARS"];

export function App() {
  const [selectedAssets, setSelectedAssets] = useState<AssetId[]>(DEFAULT_ASSETS);
  const [days, setDays] = useState(90);

  const { data, loading, error } = useDashboard(selectedAssets, days);

  const toggleAsset = (asset: AssetId) => {
    setSelectedAssets((prev) =>
      prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset],
    );
  };

  const seriesByAsset = useMemo(() => {
    const map = new Map<AssetId, (typeof data extends null ? never : NonNullable<typeof data>["series"][number])>();
    data?.series.forEach((s) => map.set(s.asset, s));
    return map;
  }, [data]);

  const metricsByAsset = useMemo(() => {
    const map = new Map<AssetId, NonNullable<typeof data>["metrics"]["perAsset"][number]>();
    data?.metrics.perAsset.forEach((m) => map.set(m.asset, m));
    return map;
  }, [data]);

  // Portfolio-level summary tiles: average across selected assets.
  const summary = useMemo(() => {
    if (!data || data.metrics.perAsset.length === 0) return null;
    const list = data.metrics.perAsset;
    const avgVol =
      list.reduce((acc, m) => {
        const last = m.rollingVolatility[m.rollingVolatility.length - 1];
        return acc + (last ? last.value : 0);
      }, 0) / list.length;
    const avgSharpe = list.reduce((acc, m) => acc + m.sharpe, 0) / list.length;
    const worstDrawdown = Math.min(...list.map((m) => m.maxDrawdown));
    const avgReturn = list.reduce((acc, m) => acc + m.windowReturn, 0) / list.length;
    return { avgVol, avgSharpe, worstDrawdown, avgReturn };
  }, [data]);

  // Pick the asset with the deepest drawdown to feature in the drawdown panel.
  const featuredDrawdownAsset = useMemo(() => {
    if (!data || data.metrics.perAsset.length === 0) return null;
    return data.metrics.perAsset.reduce((worst, m) => (m.maxDrawdown < worst.maxDrawdown ? m : worst));
  }, [data]);

  return (
    <div className="app-shell">
      <Header loading={loading} isFallback={data?.isFallback ?? false} generatedAt={data?.generatedAt} />

      <Controls
        selectedAssets={selectedAssets}
        onToggleAsset={toggleAsset}
        days={days}
        onSetDays={setDays}
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <section className="grid grid-4" aria-label="Portfolio summary metrics">
        <MetricTile
          label="Avg. Volatility (14d ann.)"
          value={summary ? formatPercent(summary.avgVol, { sign: false }) : "—"}
          pending={!summary}
        />
        <MetricTile
          label="Avg. Sharpe"
          value={summary ? formatNumber(summary.avgSharpe) : "—"}
          sub={summary ? (summary.avgSharpe >= 0 ? "risk-adjusted gain" : "risk-adjusted loss") : undefined}
          subSign={summary ? signClass(summary.avgSharpe) : "flat"}
          pending={!summary}
        />
        <MetricTile
          label="Worst Max Drawdown"
          value={summary ? formatPercent(summary.worstDrawdown, { sign: false }) : "—"}
          pending={!summary}
        />
        <MetricTile
          label={`Avg. Return (${days}d)`}
          value={summary ? formatPercent(summary.avgReturn) : "—"}
          sub={summary ? "vs. window open" : undefined}
          subSign={summary ? signClass(summary.avgReturn) : "flat"}
          pending={!summary}
        />
      </section>

      <section className="main-row" aria-label="Price tape and correlation">
        <div className="tape">
          <h2 className="panel-header">Tape · {days}D</h2>
          <div className="tape-rows">
            {selectedAssets.length === 0 && (
              <div className="cell mono" style={{ color: "var(--faint)", fontSize: 12 }}>
                No assets selected.
              </div>
            )}
            {selectedAssets.map((asset) => {
              const series = seriesByAsset.get(asset);
              const metrics = metricsByAsset.get(asset);
              if (!series || !metrics) {
                return (
                  <div className="tape-row" key={asset}>
                    <div className="tape-asset">{asset}</div>
                    <div className="tape-chart mono" style={{ color: "var(--faint)", fontSize: 11 }}>
                      —
                    </div>
                    <div className="tape-right" />
                  </div>
                );
              }
              return (
                <TapeRow
                  key={asset}
                  asset={asset}
                  points={series.points}
                  lastPrice={metrics.lastPrice}
                  windowReturn={metrics.windowReturn}
                />
              );
            })}
          </div>
        </div>

        <div className="heatmap-panel">
          <h2 className="panel-header">Correlation · Pearson · {days}D</h2>
          {data ? (
            <CorrelationHeatmap correlation={data.metrics.correlation} />
          ) : (
            <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>
              —
            </div>
          )}
        </div>
      </section>

      <section className="drawdown-panel panel" aria-label="Drawdown">
        <h2 className="panel-header">
          Max Drawdown{featuredDrawdownAsset ? ` · ${featuredDrawdownAsset.asset}` : ""}
        </h2>
        {featuredDrawdownAsset ? (
          <DrawdownChart
            curve={featuredDrawdownAsset.drawdownCurve}
            maxDrawdown={featuredDrawdownAsset.maxDrawdown}
          />
        ) : (
          <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>
            —
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Pulso — quant dashboard by Juan Cruz Maisu. Data: CoinGecko, Frankfurter.app (fixtures on rate-limit).</span>
        <span>Not investment advice.</span>
      </footer>
    </div>
  );
}
