import { useEffect, useMemo } from "react";
import { ASSET_IDS, type AssetId } from "@pulso/shared";
import { StatusStrip } from "./components/workstation/StatusStrip";
import { InstrumentWatchlist } from "./components/workstation/InstrumentWatchlist";
import { CompositeMarketChart } from "./components/workstation/CompositeMarketChart";
import { RiskStack } from "./components/workstation/RiskStack";
import { LowerDock } from "./components/workstation/LowerDock";
import { GuidedTour } from "./components/GuidedTour";
import { deriveMetrics } from "./lib/analytics";
import { useDashboard } from "./lib/useDashboard";
import { LinkedCrosshairProvider, type LowerView, type TimeWindow, useWorkstation } from "./lib/workstationStore";

const ACTIVE_ASSETS: AssetId[] = [...ASSET_IDS];
const WINDOW_KEYS: Record<string, TimeWindow> = { "1": 30, "2": 60, "3": 90, "4": 180, "5": 365 };
const VIEW_KEYS: Record<string, LowerView> = { c: "correlation", d: "drawdown", r: "relative", s: "scatter", e: "events" };

export function App() {
  return <LinkedCrosshairProvider><TerminalShell /></LinkedCrosshairProvider>;
}

function TerminalShell() {
  const {
    activeInstrument,
    timeWindow,
    setTimeWindow,
    setActiveInstrument,
    setLowerView,
    clearSelection,
    connectionState,
  } = useWorkstation();
  const { data, loading, error, responseMs } = useDashboard(ACTIVE_ASSETS, timeWindow);

  const activeSeries = data?.series.find((series) => series.asset === activeInstrument)?.points ?? [];
  const benchmark = data?.series.find((series) => series.asset === "BTC")?.points;
  const activeMetrics = useMemo(() => activeSeries.length ? deriveMetrics(activeSeries, benchmark) : null, [activeSeries, benchmark]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, [contenteditable='true']")) return;
      const selectedWindow = WINDOW_KEYS[event.key];
      const selectedView = VIEW_KEYS[event.key.toLowerCase()];
      if (selectedWindow) {
        event.preventDefault();
        setTimeWindow(selectedWindow);
        return;
      }
      if (selectedView) {
        event.preventDefault();
        setLowerView(selectedView);
        return;
      }
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const index = ACTIVE_ASSETS.indexOf(activeInstrument);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveInstrument(ACTIVE_ASSETS[(index + direction + ACTIVE_ASSETS.length) % ACTIVE_ASSETS.length]!);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeInstrument, clearSelection, setActiveInstrument, setLowerView, setTimeWindow]);

  return (
    <div className={`terminal-shell connection-${connectionState}`}>
      <StatusStrip data={data} loading={loading} error={error} responseMs={responseMs} activeMetrics={activeMetrics} />
      {error && <div className="system-error" role="alert"><b>FEED ERROR</b><span>{error}</span><em>RETRY ON NEXT CYCLE</em></div>}
      <main className="workstation-grid">
        <InstrumentWatchlist data={data} loading={loading} />
        <div className="analysis-column">
          <CompositeMarketChart data={data} loading={loading} />
          <LowerDock data={data} />
        </div>
        <RiskStack asset={activeInstrument} metrics={activeMetrics} observationCount={activeSeries.length} />
      </main>
      <footer className="command-strip" data-tour="commands">
        <span><kbd>↑↓</kbd> INSTRUMENT</span><span><kbd>1–5</kbd> WINDOW</span><span><kbd>C</kbd> CORR</span><span><kbd>D</kbd> DRAWDOWN</span><span><kbd>R</kbd> RELATIVE</span><span><kbd>S</kbd> RISK/RET</span><span><kbd>E</kbd> EVENTS</span><span><kbd>ESC</kbd> CLEAR</span>
        <em>DATA: COINGECKO / FRANKFURTER.APP · CLOSE SERIES · NOT INVESTMENT ADVICE</em>
      </footer>
      <GuidedTour />
    </div>
  );
}
