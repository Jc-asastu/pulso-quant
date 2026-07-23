import { useMemo, type PointerEvent } from "react";
import type { AssetId, DashboardResponse } from "@pulso/shared";
import { correlation, deriveEvents, deriveMetrics, normalizeSeries, type MarketEvent } from "../../lib/analytics";
import { formatNumber, formatPercent, formatTimestamp } from "../../lib/format";
import { type LowerView, useWorkstation } from "../../lib/workstationStore";

interface LowerDockProps {
  data: DashboardResponse | null;
}

const VIEWS: { id: LowerView; label: string; key: string }[] = [
  { id: "correlation", label: "CORRELATION", key: "C" },
  { id: "drawdown", label: "DRAWDOWN", key: "D" },
  { id: "relative", label: "RELATIVE", key: "R" },
  { id: "scatter", label: "RISK / RETURN", key: "S" },
  { id: "events", label: "EVENT TAPE", key: "E" },
];

export function LowerDock({ data }: LowerDockProps) {
  const { lowerView, setLowerView, activeInstrument } = useWorkstation();
  return (
    <section className="lower-dock panel-frame" aria-label="Linked analysis views" data-tour="lowerdock">
      <div className="dock-tabs">
        <div className="dock-tab-list" role="tablist">
          {VIEWS.map((view) => <button type="button" role="tab" id={`dock-tab-${view.id}`} aria-controls="lower-dock-panel" aria-selected={lowerView === view.id} tabIndex={lowerView === view.id ? 0 : -1} onClick={() => setLowerView(view.id)} key={view.id}>{view.label}<kbd>{view.key}</kbd></button>)}
        </div>
        <div className="dock-context"><span>LINKED / {activeInstrument}</span><i /> GLOBAL CROSSHAIR</div>
      </div>
      <div className="dock-content" role="tabpanel" id="lower-dock-panel" aria-labelledby={`dock-tab-${lowerView}`}>
        {lowerView === "correlation" && <CorrelationMatrix data={data} />}
        {lowerView === "drawdown" && <DrawdownTimeline data={data} />}
        {lowerView === "relative" && <RelativePerformanceChart data={data} />}
        {lowerView === "scatter" && <RiskReturnScatter data={data} />}
        {lowerView === "events" && <EventTape data={data} />}
      </div>
    </section>
  );
}

function cellColor(value: number, diagonal: boolean): string {
  if (diagonal) return "rgba(120, 169, 184, 0.08)";
  const alpha = Math.min(0.72, 0.08 + Math.abs(value) * 0.62);
  return value >= 0 ? `rgba(51, 139, 112, ${alpha})` : `rgba(190, 77, 78, ${alpha})`;
}

function CorrelationMatrix({ data }: LowerDockProps) {
  const { activeInstrument, setActiveInstrument, toggleComparison, selectedPair, setSelectedPair } = useWorkstation();
  const correlation = data?.metrics.correlation;
  if (!correlation?.assets.length) return <EmptyView text="CORRELATION REQUIRES ALIGNED RETURN SERIES" />;
  const activeIndex = correlation.assets.indexOf(activeInstrument);
  const ordered = [...correlation.assets].sort((a, b) => {
    if (a === activeInstrument) return -1;
    if (b === activeInstrument) return 1;
    const aIndex = correlation.assets.indexOf(a);
    const bIndex = correlation.assets.indexOf(b);
    return Math.abs(correlation.matrix[activeIndex]?.[bIndex] ?? 0) - Math.abs(correlation.matrix[activeIndex]?.[aIndex] ?? 0);
  });
  const selectPair = (left: AssetId, right: AssetId) => {
    if (left === right) return;
    setSelectedPair([left, right]);
    setActiveInstrument(left);
    toggleComparison(right);
  };
  return (
    <div className="correlation-layout">
      <div className="correlation-grid" style={{ gridTemplateColumns: `62px repeat(${ordered.length}, minmax(40px, 1fr))` }} role="table">
        <span />
        {ordered.map((asset) => <span className="matrix-axis" key={`x-${asset}`}>{asset}</span>)}
        {ordered.map((row) => <div key={row} style={{ display: "contents" }}>
          <span className="matrix-axis row-axis">{row}</span>
          {ordered.map((column) => {
            const i = correlation.assets.indexOf(row);
            const j = correlation.assets.indexOf(column);
            const value = correlation.matrix[i]?.[j] ?? 0;
            const isSelected = selectedPair?.[0] === row && selectedPair[1] === column;
            return <button type="button" className={`matrix-cell${isSelected ? " selected" : ""}`} key={`${row}-${column}`} style={{ background: cellColor(value, row === column) }} onClick={() => selectPair(row, column)} title={`${row} × ${column} · Pearson ${formatNumber(value)}`} aria-label={`${row} versus ${column}, Pearson correlation ${formatNumber(value)}${Math.abs(value) >= 0.7 ? ", same cluster" : ""}`} disabled={row === column}><b>{formatNumber(value)}</b><small>{Math.abs(value) >= 0.7 ? "CLUSTER" : ""}</small></button>;
          })}
        </div>)}
      </div>
      <div className="correlation-legend">
        <span>−1.0</span><i className="corr-gradient" /><span>+1.0</span>
        <p>PEARSON / LOG RETURNS<br />ORDERED AROUND {activeInstrument}<br />SELECT CELL TO COMPARE PAIR</p>
      </div>
    </div>
  );
}

function DrawdownTimeline({ data }: LowerDockProps) {
  const { activeInstrument, hoveredTimestamp, setHoveredTimestamp } = useWorkstation();
  const points = data?.series.find((series) => series.asset === activeInstrument)?.points ?? [];
  const metrics = deriveMetrics(points);
  const curve = metrics.drawdownCurve;
  const width = 1000;
  const height = 180;
  const left = 54;
  const right = 34;
  const top = 12;
  const bottom = 155;
  const floor = Math.min(metrics.maxDrawdown ?? -0.01, -0.01);
  const x = (index: number) => left + index / Math.max(1, curve.length - 1) * (width - left - right);
  const y = (value: number) => top + (value / floor) * (bottom - top);
  const line = curve.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  const area = curve.length ? `${line} L${x(curve.length - 1)},${top} L${left},${top} Z` : "";
  const troughIndex = curve.reduce((best, point, index) => point.value < (curve[best]?.value ?? 0) ? index : best, 0);
  const hoverIndex = hoveredTimestamp === null ? curve.length - 1 : curve.reduce((best, point, index) => Math.abs(point.t - hoveredTimestamp) < Math.abs((curve[best]?.t ?? 0) - hoveredTimestamp) ? index : best, 0);
  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setHoveredTimestamp(curve[Math.round(ratio * Math.max(0, curve.length - 1))]?.t ?? null);
  };
  if (curve.length < 2) return <EmptyView text="DRAWDOWN REQUIRES AT LEAST 2 OBSERVATIONS" />;
  return <div className="drawdown-layout">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onPointerMove={handlePointer} onPointerLeave={() => setHoveredTimestamp(null)}>
      {Array.from({ length: 5 }, (_, index) => { const value = floor * index / 4; return <g key={index}><line className="grid-line" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="axis-text" x={left - 8} y={y(value) + 3} textAnchor="end">{formatPercent(value, { decimals: 0 })}</text></g>; })}
      <path className="drawdown-area" d={area} /><path className="drawdown-line" d={line} />
      <g className="trough-mark"><line x1={x(troughIndex)} x2={x(troughIndex)} y1={top} y2={bottom} /><circle cx={x(troughIndex)} cy={y(curve[troughIndex]?.value ?? 0)} r="3" /><text x={x(troughIndex) + 5} y={Math.min(bottom - 5, y(curve[troughIndex]?.value ?? 0) + 15)}>TROUGH {formatPercent(curve[troughIndex]?.value ?? 0)}</text></g>
      {curve[hoverIndex] && <g className="crosshair"><line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={top} y2={bottom} /><circle cx={x(hoverIndex)} cy={y(curve[hoverIndex]!.value)} r="3" /></g>}
    </svg>
    <div className="dock-side-stats"><Stat label="MAX DEPTH" value={formatPercent(metrics.maxDrawdown ?? 0)} /><Stat label="MAX DURATION" value={`${metrics.drawdownDuration ?? 0} OBS`} /><Stat label="CURRENT STATE" value={(curve.at(-1)?.value ?? 0) === 0 ? "RECOVERED" : "UNDERWATER"} /><Stat label="CURSOR" value={curve[hoverIndex] ? formatTimestamp(curve[hoverIndex]!.t) : "—"} /><Stat label="AT CURSOR" value={formatPercent(curve[hoverIndex]?.value ?? 0)} /><Stat label="RECOVERY" value={(curve.at(-1)?.value ?? 0) === 0 ? "COMPLETE" : "PENDING"} /></div>
  </div>;
}

function RelativePerformanceChart({ data }: LowerDockProps) {
  const { activeInstrument, hoveredTimestamp, setHoveredTimestamp } = useWorkstation();
  const allSeries = data?.series ?? [];
  if (!allSeries.length) return <EmptyView text="RELATIVE PERFORMANCE REQUIRES PRICE SERIES" />;
  const series = allSeries.map((item) => ({ asset: item.asset, points: normalizeSeries(item.points) }));
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const low = Math.min(...values, -0.01);
  const high = Math.max(...values, 0.01);
  const width = 1000; const height = 180; const left = 56; const right = 96; const top = 10; const bottom = 156;
  const maxLength = Math.max(...series.map((item) => item.points.length));
  const x = (index: number) => left + index / Math.max(1, maxLength - 1) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low || 1) * (bottom - top);
  const base = series.find((item) => item.asset === activeInstrument)?.points ?? series[0]!.points;
  const hoverIndex = hoveredTimestamp === null ? base.length - 1 : base.reduce((best, point, index) => Math.abs(point.t - hoveredTimestamp) < Math.abs((base[best]?.t ?? 0) - hoveredTimestamp) ? index : best, 0);
  const handlePointer = (event: PointerEvent<SVGSVGElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); setHoveredTimestamp(base[Math.round(ratio * Math.max(0, base.length - 1))]?.t ?? null); };
  return <div className="relative-layout"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onPointerMove={handlePointer} onPointerLeave={() => setHoveredTimestamp(null)}>
    <line className="zero-line" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
    {Array.from({ length: 5 }, (_, index) => { const value = high - index / 4 * (high - low); return <g key={index}><line className="grid-line" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="axis-text" x={left - 8} y={y(value) + 3} textAnchor="end">{formatPercent(value, { decimals: 0 })}</text></g>; })}
    {series.map((item, seriesIndex) => <path key={item.asset} className={`relative-line series-${seriesIndex}${item.asset === activeInstrument ? " active" : ""}`} d={item.points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ")} />)}
    {base[hoverIndex] && <g className="crosshair"><line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={top} y2={bottom} /></g>}
    {series.map((item, index) => { const point = item.points.at(-1); return point ? <text key={item.asset} className={`series-label series-${index}`} x={width - right + 8} y={y(point.value) + 3}>{item.asset} {formatPercent(point.value)}</text> : null; })}
  </svg><div className="relative-footer">NORMALIZED TO WINDOW OPEN · CURSOR {base[hoverIndex] ? formatTimestamp(base[hoverIndex]!.t) : "—"}</div></div>;
}

function RiskReturnScatter({ data }: LowerDockProps) {
  const { activeInstrument, setActiveInstrument } = useWorkstation();
  const observations = (data?.series ?? []).map((series) => {
    const benchmark = data?.series.find((item) => item.asset === "BTC")?.points;
    const metrics = deriveMetrics(series.points, benchmark);
    const first = series.points[0]?.price;
    const last = series.points.at(-1)?.price;
    return {
      asset: series.asset,
      volatility: metrics.volatility,
      windowReturn: first && last ? last / first - 1 : null,
      drawdown: metrics.maxDrawdown,
      riskScore: metrics.riskScore,
    };
  }).filter((item) => item.volatility !== null && item.windowReturn !== null);
  if (!observations.length) return <EmptyView text="RISK / RETURN REQUIRES AT LEAST 14 OBSERVATIONS" />;

  const width = 1000; const height = 180; const left = 64; const right = 90; const top = 12; const bottom = 154;
  const maxVol = Math.max(...observations.map((item) => item.volatility ?? 0), 0.01) * 1.12;
  const returns = observations.map((item) => item.windowReturn ?? 0);
  const minReturn = Math.min(...returns, 0); const maxReturn = Math.max(...returns, 0);
  const returnPad = (maxReturn - minReturn || 0.02) * 0.16;
  const floor = minReturn - returnPad; const ceiling = maxReturn + returnPad;
  const x = (value: number) => left + value / maxVol * (width - left - right);
  const y = (value: number) => top + (ceiling - value) / (ceiling - floor || 1) * (bottom - top);

  return <div className="scatter-layout">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Risk return dispersion for all selected instruments">
      {Array.from({ length: 5 }, (_, index) => { const value = index / 4 * maxVol; return <g key={`x-${index}`}><line className="grid-line vertical" x1={x(value)} x2={x(value)} y1={top} y2={bottom} /><text className="axis-text" x={x(value)} y={height - 5} textAnchor="middle">{formatPercent(value, { decimals: 0, sign: false })}</text></g>; })}
      {Array.from({ length: 5 }, (_, index) => { const value = ceiling - index / 4 * (ceiling - floor); return <g key={`y-${index}`}><line className="grid-line" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="axis-text" x={left - 8} y={y(value) + 3} textAnchor="end">{formatPercent(value, { decimals: 0 })}</text></g>; })}
      <line className="zero-line" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
      <text className="axis-section-label" x={width - right} y={height - 5} textAnchor="end">REALIZED VOLATILITY →</text>
      <text className="axis-section-label" x={left + 5} y={top + 8}>WINDOW RETURN ↑</text>
      {observations.map((item, index) => {
        const active = item.asset === activeInstrument;
        const radius = 5 + Math.min(9, Math.abs(item.drawdown ?? 0) * 28);
        const labelOffsetY = ((index % 3) - 1) * 9;
        const label = `${item.asset}: return ${formatPercent(item.windowReturn ?? 0)}, volatility ${formatPercent(item.volatility ?? 0, { sign: false })}, max drawdown ${formatPercent(item.drawdown ?? 0)}, risk score ${item.riskScore?.toFixed(0) ?? "N/A"}`;
        return <g key={item.asset} className={`scatter-node series-${index}${active ? " active" : ""}`} role="button" tabIndex={0} aria-label={label} onClick={() => setActiveInstrument(item.asset)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveInstrument(item.asset); }}>
          <circle cx={x(item.volatility ?? 0)} cy={y(item.windowReturn ?? 0)} r={radius} />
          <line x1={x(item.volatility ?? 0) - radius - 3} x2={x(item.volatility ?? 0) + radius + 3} y1={y(item.windowReturn ?? 0)} y2={y(item.windowReturn ?? 0)} />
          <text x={x(item.volatility ?? 0) + radius + 5} y={y(item.windowReturn ?? 0) + 3 + labelOffsetY}>{item.asset}</text>
          <title>{label}</title>
        </g>;
      })}
    </svg>
    <div className="scatter-legend"><span>BUBBLE = MAX DRAWDOWN</span><span>CROSS = ACTIVE</span><span>CLICK / ENTER TO LINK</span></div>
  </div>;
}

function EventTape({ data }: LowerDockProps) {
  const { setActiveInstrument, setHoveredTimestamp } = useWorkstation();
  const events = useMemo(() => {
    const derived = (data?.series ?? []).flatMap((series) => deriveEvents(series.asset, series.points));
    const benchmark = data?.series.find((series) => series.asset === "BTC");
    if (benchmark) {
      for (const series of data?.series ?? []) {
        if (series.asset === "BTC") continue;
        const assetReturns = deriveMetrics(series.points).logReturns;
        const benchmarkReturns = deriveMetrics(benchmark.points).logReturns;
        const length = Math.min(assetReturns.length, benchmarkReturns.length);
        if (length < 20) continue;
        const midpoint = Math.floor(length / 2);
        const previous = correlation(assetReturns.slice(-length, -length + midpoint), benchmarkReturns.slice(-length, -length + midpoint));
        const current = correlation(assetReturns.slice(-midpoint), benchmarkReturns.slice(-midpoint));
        if (previous !== null && current !== null && Math.abs(current - previous) >= 0.35) {
          derived.push({ id: `${series.asset}-correlation-break`, t: series.points.at(-1)?.t ?? Date.now(), asset: series.asset, type: "warning", code: "CORRELATION BREAK", detail: `BTC ${previous.toFixed(2)} → ${current.toFixed(2)} · Δ ${(current - previous).toFixed(2)}` });
        }
      }
    }
    if (data?.isFallback) derived.push({ id: "source-degraded", t: Date.now(), asset: "BTC", type: "data", code: "DATA SOURCE DEGRADED", detail: "CACHED FIXTURE SERIES ACTIVE" });
    if (!derived.length && data?.series.length) {
      const first = data.series[0]!;
      const latest = first.points.at(-1);
      if (latest) derived.push({ id: "normal", t: latest.t, asset: first.asset, type: "recovery", code: "NO ACTIVE ANOMALIES", detail: "RULE ENGINE WITHIN THRESHOLDS" });
    }
    return derived.sort((a, b) => b.t - a.t);
  }, [data]) as MarketEvent[];
  return <div className="event-tape"><div className="event-columns"><span>TIME</span><span>ASSET</span><span>EVENT</span><span>CONTEXT</span><span>STATE</span></div>{events.map((event) => <button type="button" className={`event-row event-${event.type}`} key={event.id} onClick={() => { setActiveInstrument(event.asset); setHoveredTimestamp(event.t); }} aria-label={`${event.asset}, ${event.code}, ${event.detail}, ${formatTimestamp(event.t)}. Select to link charts.`}><time>{new Date(event.t).toISOString().slice(11, 23)}</time><b>{event.asset}</b><strong>{event.code}</strong><span>{event.detail}</span><em>{event.type.toUpperCase()}</em></button>)}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function EmptyView({ text }: { text: string }) {
  return <div className="empty-view"><span>N/A</span><p>{text}</p></div>;
}
