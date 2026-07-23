import type { AssetId } from "@pulso/shared";
import type { DerivedMetrics } from "../../lib/analytics";
import { formatNumber, formatPercent } from "../../lib/format";
import { useWorkstation } from "../../lib/workstationStore";

interface RiskStackProps {
  asset: AssetId;
  metrics: DerivedMetrics | null;
  observationCount: number;
}

interface MetricRowProps {
  id: string;
  label: string;
  value: string;
  context: string;
  position: number | null;
  tone?: "neutral" | "positive" | "negative" | "warning";
  method: string;
}

const METHODS: Record<string, string> = {
  vol: "14-observation sample stdev of log returns × √365; percentile and delta use available rolling history.",
  sharpe: "Mean daily log return divided by sample standard deviation, annualized by √365.",
  sortino: "Mean daily log return divided by downside deviation, annualized by √365.",
  var: "Empirical 5th percentile of one-period simple returns.",
  es: "Mean of simple returns at or below historical VaR 95%.",
  drawdown: "Minimum distance from the running peak; duration is the longest consecutive span below a peak.",
  beta: "Covariance with aligned BTC log returns divided by BTC return variance.",
  momentum: "Latest price versus 20 observations earlier; z-score uses the trailing 30 observations.",
  distance: "Latest price divided by the maximum price in the selected window, minus one.",
};

export function RiskMetricRow({ id, label, value, context, position, tone = "neutral", method }: MetricRowProps) {
  const { selectedMetric, setSelectedMetric } = useWorkstation();
  return (
    <button
      type="button"
      className={`risk-row tone-${tone}${selectedMetric === id ? " metric-selected" : ""}`}
      onClick={() => setSelectedMetric(selectedMetric === id ? null : id)}
      title={method}
      aria-pressed={selectedMetric === id}
      aria-describedby={`risk-method-${id}`}
    >
      <span className="risk-copy"><small>{label}</small><b>{value}</b></span>
      <span className="risk-context">{context}</span>
      <span className="bullet-track" aria-hidden="true"><i style={{ left: `${Math.max(0, Math.min(100, position ?? 0))}%` }} /><em style={{ width: `${Math.max(0, Math.min(100, position ?? 0))}%` }} /></span>
      <span className="sr-only" id={`risk-method-${id}`}>{method}</span>
    </button>
  );
}

function safePercent(value: number | null, sign = true): string {
  return value === null ? "N/A" : formatPercent(value, { sign });
}

function safeNumber(value: number | null): string {
  return value === null ? "N/A" : formatNumber(value);
}

function positionSigned(value: number | null, limit = 3): number | null {
  return value === null ? null : 50 + Math.max(-limit, Math.min(limit, value)) / limit * 50;
}

function severityClass(score: number | null | undefined): "sev-low" | "sev-mid" | "sev-high" | "sev-na" {
  if (score === null || score === undefined) return "sev-na";
  if (score > 70) return "sev-high";
  if (score >= 40) return "sev-mid";
  return "sev-low";
}

export function RiskStack({ asset, metrics, observationCount }: RiskStackProps) {
  const { selectedMetric } = useWorkstation();
  const enough = observationCount >= 3;
  const riskTone = !metrics?.riskScore ? "neutral" : metrics.riskScore >= 75 ? "negative" : metrics.riskScore >= 55 ? "warning" : "positive";
  const severity = severityClass(metrics?.riskScore ?? null);

  return (
    <aside className="risk-stack panel-frame" aria-label={`Risk stack for ${asset}`} data-tour="risk">
      <div className="compact-heading risk-heading">
        <div><span className="eyebrow">RISK STACK</span><strong>{asset} / {observationCount} OBS</strong></div>
        <span className={`regime-badge regime-${metrics?.regime.toLowerCase() ?? "na"}`}>{metrics?.regime ?? "N/A"}</span>
      </div>
      <div className={`risk-score-block ${severity}`}>
        <span>COMPOSITE RISK</span>
        <b className={severity}>{metrics?.riskScore === null || metrics?.riskScore === undefined ? "N/A" : metrics.riskScore.toFixed(0)}</b>
        <div className={`risk-scale ${severity}`}><i style={{ width: `${metrics?.riskScore ?? 0}%` }} /></div>
        <small>0 STABLE <em>100 EXTREME</em></small>
      </div>
      <div className="risk-rows">
        <RiskMetricRow id="vol" label="REALIZED VOL / ANN." value={safePercent(metrics?.volatility ?? null, false)} context={metrics?.volatilityPercentile === null || metrics?.volatilityPercentile === undefined ? "N/A · NEED 14 OBS" : `PCTL ${metrics.volatilityPercentile.toFixed(0)} · Δ ${metrics.volatilityDelta30 === null ? "N/A" : `${metrics.volatilityDelta30 >= 0 ? "+" : ""}${(metrics.volatilityDelta30 * 100).toFixed(1)}pp`}`} position={metrics?.volatilityPercentile ?? null} tone={metrics?.regime === "HIGH" ? "warning" : "neutral"} method={METHODS.vol!} />
        <RiskMetricRow id="sharpe" label="SHARPE / RF 0" value={safeNumber(metrics?.sharpe ?? null)} context={enough ? "ANNUALIZED · LOG RET" : "N/A · NEED 3 OBS"} position={positionSigned(metrics?.sharpe ?? null)} tone={(metrics?.sharpe ?? 0) >= 0 ? "positive" : "negative"} method={METHODS.sharpe!} />
        <RiskMetricRow id="sortino" label="SORTINO" value={safeNumber(metrics?.sortino ?? null)} context={metrics?.sortino === null || metrics?.sortino === undefined ? "N/A · NO DOWNSIDE SET" : "DOWNSIDE DEV · ANN."} position={positionSigned(metrics?.sortino ?? null)} tone={(metrics?.sortino ?? 0) >= 0 ? "positive" : "negative"} method={METHODS.sortino!} />
        <RiskMetricRow id="var" label="HISTORICAL VAR / 95" value={safePercent(metrics?.var95 ?? null)} context={metrics?.var95 === null || metrics?.var95 === undefined ? "N/A · NEED 10 OBS" : "1D EMPIRICAL TAIL"} position={metrics?.var95 === null || metrics?.var95 === undefined ? null : Math.min(100, Math.abs(metrics.var95) * 1_200)} tone="negative" method={METHODS.var!} />
        <RiskMetricRow id="es" label="EXPECTED SHORTFALL" value={safePercent(metrics?.expectedShortfall ?? null)} context={metrics?.expectedShortfall === null || metrics?.expectedShortfall === undefined ? "N/A · EMPTY TAIL" : "MEAN ≤ VAR 95"} position={metrics?.expectedShortfall === null || metrics?.expectedShortfall === undefined ? null : Math.min(100, Math.abs(metrics.expectedShortfall) * 1_000)} tone="negative" method={METHODS.es!} />
        <RiskMetricRow id="drawdown" label="MAX DRAWDOWN" value={safePercent(metrics?.maxDrawdown ?? null)} context={metrics?.drawdownDuration === null || metrics?.drawdownDuration === undefined ? "N/A" : `${metrics.drawdownDuration} OBS MAX DURATION`} position={metrics?.maxDrawdown === null || metrics?.maxDrawdown === undefined ? null : Math.min(100, Math.abs(metrics.maxDrawdown) * 250)} tone="negative" method={METHODS.drawdown!} />
        <RiskMetricRow id="beta" label="BETA / BTC" value={asset === "BTC" ? "1.00" : safeNumber(metrics?.beta ?? null)} context={asset === "BTC" ? "BENCHMARK" : metrics?.beta === null || metrics?.beta === undefined ? "N/A · ALIGNMENT" : `CORR ${formatNumber(metrics.correlation ?? 0)}`} position={asset === "BTC" ? 66 : positionSigned(metrics?.beta ?? null, 2)} method={METHODS.beta!} />
        <RiskMetricRow id="momentum" label="MOMENTUM / 20 OBS" value={safePercent(metrics?.momentum ?? null)} context={metrics?.zScore === null || metrics?.zScore === undefined ? "Z N/A" : `Z ${formatNumber(metrics.zScore)} · ${Math.abs(metrics.zScore) >= 2 ? "ANOMALY" : "NORMAL"}`} position={positionSigned(metrics?.zScore ?? null, 3)} tone={(metrics?.momentum ?? 0) >= 0 ? "positive" : "negative"} method={METHODS.momentum!} />
        <RiskMetricRow id="distance" label="DISTANCE TO HIGH" value={safePercent(metrics?.distanceToHigh ?? null)} context="WINDOW RUNNING HIGH" position={metrics?.distanceToHigh === null || metrics?.distanceToHigh === undefined ? null : Math.max(0, 100 + metrics.distanceToHigh * 250)} method={METHODS.distance!} />
      </div>
      <div className={`risk-method-footer${selectedMetric ? " expanded" : ""}`} title={selectedMetric ? METHODS[selectedMetric] : undefined}><span>{selectedMetric ? `METHOD / ${selectedMetric.toUpperCase()}` : "CLICK ROW FOR FOCUS"}</span><span>{selectedMetric ? METHODS[selectedMetric] : "HOVER FOR METHOD"}</span></div>
      <span className={`risk-tone-sentinel tone-${riskTone}`} aria-hidden="true" />
    </aside>
  );
}
