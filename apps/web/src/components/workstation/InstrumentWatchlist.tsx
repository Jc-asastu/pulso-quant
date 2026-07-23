import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardResponse, PricePoint } from "@pulso/shared";
import { ASSET_CATALOG, ASSET_IDS } from "@pulso/shared";
import { deriveMetrics } from "../../lib/analytics";
import { formatPercent, formatPrice, signClass } from "../../lib/format";
import { useWorkstation } from "../../lib/workstationStore";

interface InstrumentWatchlistProps {
  data: DashboardResponse | null;
  loading: boolean;
}

function SparklineCanvas({ points, positive }: { points: PricePoint[]; positive: boolean }) {
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const sampled = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 28)) === 0);
    if (sampled.at(-1) !== points.at(-1)) sampled.push(points.at(-1)!);
    const values = sampled.map((point) => point.price);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const range = high - low || 1;
    return sampled.map((point, index) => {
      const x = (index / Math.max(1, sampled.length - 1)) * 72;
      const y = 18 - ((point.price - low) / range) * 16;
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [points]);

  return (
    <svg className="watch-spark" viewBox="0 0 72 20" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="72" y1="10" y2="10" />
      <path d={path} className={positive ? "spark-up" : "spark-down"} />
    </svg>
  );
}

function PricePulse({ value }: { value: number }) {
  const previous = useRef(value);
  const [direction, setDirection] = useState<"rise" | "fall" | "">("");

  useEffect(() => {
    if (previous.current === value) return;
    setDirection(value > previous.current ? "rise" : "fall");
    previous.current = value;
    const timer = window.setTimeout(() => setDirection(""), 240);
    return () => window.clearTimeout(timer);
  }, [value]);

  return <b className={`price-pulse ${direction}`}>{formatPrice(value)}</b>;
}

export function InstrumentWatchlist({ data, loading }: InstrumentWatchlistProps) {
  const { activeInstrument, setActiveInstrument, comparisonInstruments, toggleComparison } = useWorkstation();
  const btc = data?.series.find((series) => series.asset === "BTC")?.points;
  const rows = useMemo(() => (data?.series ?? []).map((series) => {
    const metrics = deriveMetrics(series.points, btc);
    const latest = series.points.at(-1)?.price ?? 0;
    const change = series.points.length > 1 && series.points[0]!.price ? latest / series.points[0]!.price - 1 : 0;
    return { series, metrics, latest, change, anomaly: Math.abs(metrics.zScore ?? 0) >= 2 || metrics.regime === "HIGH" };
  }), [data, btc]);

  return (
    <aside className="watchlist panel-frame" aria-label="Market watch" data-tour="watchlist">
      <div className="compact-heading">
        <div><span className="eyebrow">MARKET WATCH</span><strong>{String(ASSET_IDS.length).padStart(2, "0")} INSTRUMENTS</strong></div>
        <span className="heading-meta">VOL / Z / LIQ</span>
      </div>
      <div className="watch-columns" aria-hidden="true">
        <span>SYMBOL</span><span>LAST / Δ</span><span>TRACE</span><span>RISK</span>
      </div>
      <div className="watch-rows">
        {rows.map(({ series, metrics, latest, change, anomaly }) => {
          const isActive = activeInstrument === series.asset;
          return (
            <button
              type="button"
              className={`watch-row${isActive ? " selected" : ""}`}
              key={series.asset}
              onClick={() => setActiveInstrument(series.asset)}
              onDoubleClick={() => toggleComparison(series.asset)}
              aria-pressed={isActive}
              title={`Select ${ASSET_CATALOG[series.asset].label}; double-click to compare`}
            >
              <span className="watch-id">
                <b>{series.asset}</b>
                <small>{ASSET_CATALOG[series.asset].kind.toUpperCase()}</small>
              </span>
              <span className="watch-price">
                <PricePulse value={latest} />
                <small className={signClass(change)}>{formatPercent(change)}</small>
              </span>
              <SparklineCanvas points={series.points} positive={change >= 0} />
              <span className="watch-risk">
                <b className={anomaly ? "warning" : ""}>{metrics.volatility === null ? "N/A" : `${(metrics.volatility * 100).toFixed(1)}`}</b>
                <small>Z {metrics.zScore === null ? "—" : metrics.zScore.toFixed(1)} · L {metrics.liquidityProxy === null ? "—" : metrics.liquidityProxy.toFixed(1)}</small>
              </span>
              <span className={`anomaly-mark${anomaly ? " hot" : ""}`} aria-label={anomaly ? "Anomaly detected" : "Normal"} />
            </button>
          );
        })}
        {loading && !data && Array.from({ length: 5 }, (_, index) => <div className="watch-row skeleton-row" key={index} />)}
      </div>
      <div className="watch-footer">
        <span><i className="legend-dot selection" /> ACTIVE</span>
        <span><i className="legend-dot compare" /> {comparisonInstruments.length ? `COMPARE ${comparisonInstruments.length} · ${comparisonInstruments.join(" ")}` : "COMPARE OFF"}</span>
      </div>
    </aside>
  );
}
