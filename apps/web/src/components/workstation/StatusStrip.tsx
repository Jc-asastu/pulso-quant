import { useEffect, useMemo, useState } from "react";
import { ASSET_CATALOG, type DashboardResponse } from "@pulso/shared";
import type { DerivedMetrics } from "../../lib/analytics";
import { useWorkstation } from "../../lib/workstationStore";

interface StatusStripProps {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  responseMs: number | null;
  activeMetrics: DerivedMetrics | null;
}

function clock(date: Date, utc = false): string {
  const value = utc
    ? new Date(date.getTime() + date.getTimezoneOffset() * 60_000)
    : date;
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: utc ? "UTC" : undefined,
  });
}

export function StatusStrip({ data, loading, error, responseMs, activeMetrics }: StatusStripProps) {
  const { activeInstrument, connectionState, setConnectionState, timeWindow } = useWorkstation();
  const [now, setNow] = useState(() => new Date());

  const ageMs = data ? Math.max(0, now.getTime() - new Date(data.generatedAt).getTime()) : null;
  const derivedState = error
    ? "error"
    : loading && !data
      ? "loading"
      : data?.isFallback
        ? "cached"
        : ageMs !== null && ageMs > 15 * 60_000
          ? "stale"
          : data
            ? "live"
            : "disconnected";

  useEffect(() => {
    setConnectionState(derivedState);
  }, [derivedState, setConnectionState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const ageLabel = useMemo(() => {
    if (ageMs === null) return "—";
    if (ageMs < 1_000) return `${ageMs.toFixed(0)}ms`;
    if (ageMs < 60_000) return `${(ageMs / 1_000).toFixed(0)}s`;
    return `${(ageMs / 60_000).toFixed(0)}m`;
  }, [ageMs]);

  return (
    <header className="status-strip" aria-label="System and market status" data-tour="status">
      <div className="brand-lockup">
        <img className="brand-logo" src="/pulso.png" alt="Pulso" />
        <span className="brand-desk">QUANT / RISK</span>
      </div>
      <div className={`feed-state state-${connectionState}`} role="status" aria-live="polite">
        <span className="heartbeat" aria-hidden="true" />
        <strong>{connectionState.toUpperCase()}</strong>
      </div>
      <StatusDatum label="PROVIDER" value={data?.isFallback ? "LOCAL FIXTURE" : "COINGECKO + FX"} />
      <StatusDatum label="ROUNDTRIP" value={responseMs === null ? "—" : `${responseMs.toFixed(0)}ms`} />
      <StatusDatum label="DATA AGE" value={ageLabel} />
      <StatusDatum label="LAST" value={data ? new Date(data.generatedAt).toISOString().slice(11, 23) : "—"} />
      <StatusDatum label="SESSION" value={ASSET_CATALOG[activeInstrument].kind === "crypto" ? "24/7 CRYPTO" : "GLOBAL FX"} />
      <StatusDatum label="CACHE" value={data?.isFallback ? "READ" : data ? "BYPASS" : "—"} emphasis={Boolean(data?.isFallback)} />
      <StatusDatum label="WINDOW" value={timeWindow === 365 ? "1Y" : `${timeWindow}D`} />
      <StatusDatum label="REGIME" value={activeMetrics?.regime ?? "N/A"} emphasis={activeMetrics?.regime === "HIGH"} />
      <StatusDatum label="OBS" value={data?.series[0]?.points.length.toString() ?? "—"} />
      <div className="status-spacer" />
      <button type="button" className="currency-switch" aria-label="Base currency USD">BASE&nbsp; USD</button>
      <StatusDatum label="UTC" value={clock(now, true)} />
      <StatusDatum label="LOCAL" value={clock(now)} />
    </header>
  );
}

function StatusDatum({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`status-datum${emphasis ? " status-emphasis" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
