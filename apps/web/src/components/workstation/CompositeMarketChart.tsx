import { useMemo, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import type { DashboardResponse, PricePoint } from "@pulso/shared";
import { ASSET_CATALOG, ASSET_IDS } from "@pulso/shared";
import { mean, stdDev } from "../../lib/analytics";
import { formatNumber, formatPercent, formatPrice, formatTimestamp } from "../../lib/format";
import { MAX_COMPARISONS, type DisplayMode, type TimeWindow, useWorkstation } from "../../lib/workstationStore";

const COMPARE_PALETTE = ["#d3a34a", "#8e7bb9", "#4fb58b", "#d27e56", "#c778a9", "#6f8fd8", "#4fb5b0", "#b0b04f"] as const;

const LABEL_FONT_SIZE = 11;
const LABEL_MIN_GAP = 13;
const LABEL_OFFSET = 5;

interface CompositeMarketChartProps {
  data: DashboardResponse | null;
  loading: boolean;
}

interface ChartPoint {
  t: number;
  value: number;
  raw: number;
}

const WIDTH = 1000;
const HEIGHT = 430;
const LEFT = 58;
const RIGHT = 62;
const TOP = 28;
const PRICE_BOTTOM = 330;
const ACTIVITY_TOP = 350;
const BOTTOM = 410;

function transform(points: PricePoint[], mode: DisplayMode): ChartPoint[] {
  const first = points[0]?.price ?? 1;
  return points.map((point, index) => {
    if (mode === "price") return { t: point.t, value: point.price, raw: point.price };
    if (mode === "return") return { t: point.t, value: point.price / first - 1, raw: point.price };
    const window = points.slice(Math.max(0, index - 29), index + 1).map((item) => item.price);
    const deviation = stdDev(window);
    return { t: point.t, value: deviation && window.length >= 3 ? (point.price - mean(window)) / deviation : 0, raw: point.price };
  });
}

function pathFor(points: ChartPoint[], x: (index: number) => number, y: (value: number) => number): string {
  return points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
}

function formatAxis(value: number, mode: DisplayMode): string {
  if (mode === "price") return value >= 1_000 ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : value.toFixed(value >= 100 ? 1 : 3);
  if (mode === "return") return `${(value * 100).toFixed(1)}%`;
  return `${value.toFixed(1)}σ`;
}

export function CompositeMarketChart({ data, loading }: CompositeMarketChartProps) {
  const {
    activeInstrument,
    comparisonInstruments,
    toggleComparison,
    timeWindow,
    setTimeWindow,
    displayMode,
    setDisplayMode,
    hoveredTimestamp,
    setHoveredTimestamp,
  } = useWorkstation();

  const activeSeries = data?.series.find((series) => series.asset === activeInstrument)?.points ?? [];
  const comparisonSeriesList = comparisonInstruments.map((asset) => ({
    asset,
    color: COMPARE_PALETTE[comparisonInstruments.indexOf(asset) % COMPARE_PALETTE.length]!,
    points: data?.series.find((series) => series.asset === asset)?.points ?? [],
  }));

  const chart = useMemo(() => {
    const primary = transform(activeSeries, displayMode);
    const rebase = (raw: ChartPoint[]) => displayMode === "price" && raw.length
      ? raw.map((point) => ({
        ...point,
        value: (point.value / (raw[0]?.value || 1)) * (primary[0]?.value || 1),
      }))
      : raw;
    const comparisons = comparisonSeriesList.map((entry) => ({
      asset: entry.asset,
      color: entry.color,
      points: rebase(transform(entry.points, displayMode)),
    }));
    const allValues = [
      ...primary.map((point) => point.value),
      ...comparisons.flatMap((entry) => entry.points.map((point) => point.value)),
    ];
    let low = allValues.length ? Math.min(...allValues) : 0;
    let high = allValues.length ? Math.max(...allValues) : 1;
    const padding = (high - low || Math.abs(high) || 1) * 0.1;
    low -= padding;
    high += padding;
    const x = (index: number) => LEFT + (index / Math.max(1, primary.length - 1)) * (WIDTH - LEFT - RIGHT);
    const y = (value: number) => TOP + ((high - value) / (high - low || 1)) * (PRICE_BOTTOM - TOP);
    const activePath = pathFor(primary, x, y);
    const comparisonPaths = comparisons.map((entry) => ({
      asset: entry.asset,
      color: entry.color,
      path: pathFor(entry.points, (index) => LEFT + (index / Math.max(1, entry.points.length - 1)) * (WIDTH - LEFT - RIGHT), y),
      points: entry.points,
    }));

    const bandPoints = activeSeries.map((_, index) => {
      const prices = activeSeries.slice(Math.max(0, index - 19), index + 1).map((item) => item.price);
      const average = mean(prices);
      const deviation = stdDev(prices);
      if (displayMode !== "price" || prices.length < 5) return null;
      return { upper: y(average + deviation * 2), lower: y(average - deviation * 2), mid: y(average) };
    });
    const validBands = bandPoints.map((point, index) => point ? { ...point, x: x(index) } : null).filter(Boolean) as { upper: number; lower: number; mid: number; x: number }[];
    const bandArea = validBands.length
      ? `${validBands.map((point, index) => `${index ? "L" : "M"}${point.x},${point.upper}`).join(" ")} ${[...validBands].reverse().map((point) => `L${point.x},${point.lower}`).join(" ")} Z`
      : "";
    const midPath = validBands.map((point, index) => `${index ? "L" : "M"}${point.x},${point.mid}`).join(" ");
    const returns = activeSeries.slice(1).map((point, index) => {
      const previous = activeSeries[index]?.price ?? point.price;
      return previous ? Math.abs(point.price / previous - 1) : 0;
    });
    const maxActivity = Math.max(...returns, 0.0001);
    const troughIndex = primary.reduce((best, point, index) => point.raw < (primary[best]?.raw ?? Infinity) ? index : best, 0);
    let runningPeak = Number.NEGATIVE_INFINITY;
    let maxDrawdown = 0;
    let maxDrawdownIndex = 0;
    activeSeries.forEach((point, index) => {
      runningPeak = Math.max(runningPeak, point.price);
      const drawdown = runningPeak > 0 ? point.price / runningPeak - 1 : 0;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownIndex = index;
      }
    });
    const timestampDeltas = activeSeries.slice(1).map((point, index) => point.t - (activeSeries[index]?.t ?? point.t)).filter((delta) => delta > 0).sort((a, b) => a - b);
    const medianDelta = timestampDeltas[Math.floor(timestampDeltas.length / 2)] ?? 0;
    const gapCount = medianDelta
      ? timestampDeltas.reduce((count, delta) => count + (delta > medianDelta * 1.8 ? Math.max(1, Math.round(delta / medianDelta) - 1) : 0), 0)
      : 0;
    const anomalyIndices = returns.map((value, index) => value > mean(returns) + stdDev(returns) * 2.4 ? index + 1 : -1).filter((index) => index >= 0);

    const endLabels = (() => {
      const rawLabels: { asset: string; color: string; x: number; y: number }[] = [];
      const lastPrimary = primary.at(-1);
      if (lastPrimary) {
        rawLabels.push({ asset: activeInstrument, color: "var(--focus)", x: x(primary.length - 1), y: y(lastPrimary.value) });
      }
      comparisonPaths.forEach((entry) => {
        const lastPoint = entry.points.at(-1);
        if (!lastPoint) return;
        const entryX = LEFT + ((entry.points.length - 1) / Math.max(1, entry.points.length - 1)) * (WIDTH - LEFT - RIGHT);
        rawLabels.push({ asset: entry.asset, color: entry.color, x: entryX, y: y(lastPoint.value) });
      });
      const sorted = [...rawLabels].sort((a, b) => a.y - b.y);
      for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1]!;
        const current = sorted[index]!;
        if (current.y - previous.y < LABEL_MIN_GAP) {
          current.y = previous.y + LABEL_MIN_GAP;
        }
      }
      const maxY = PRICE_BOTTOM - 6;
      const minY = TOP + 6;
      for (let index = sorted.length - 1; index >= 0; index -= 1) {
        const label = sorted[index]!;
        if (label.y > maxY) label.y = maxY;
        if (index > 0 && sorted[index - 1]!.y > label.y - LABEL_MIN_GAP) {
          sorted[index - 1]!.y = label.y - LABEL_MIN_GAP;
        }
      }
      sorted.forEach((label) => {
        if (label.y < minY) label.y = minY;
      });
      return sorted;
    })();

    return { primary, comparisonPaths, low, high, x, y, activePath, bandArea, midPath, returns, maxActivity, troughIndex, maxDrawdown, maxDrawdownIndex, gapCount, anomalyIndices, endLabels };
  }, [activeSeries, comparisonSeriesList, displayMode, activeInstrument]);

  const hoverIndex = hoveredTimestamp === null || !chart.primary.length
    ? chart.primary.length - 1
    : chart.primary.reduce((best, point, index) => Math.abs(point.t - hoveredTimestamp) < Math.abs((chart.primary[best]?.t ?? 0) - hoveredTimestamp) ? index : best, 0);
  const hoverPoint = chart.primary[hoverIndex];
  const compareHovers = chart.comparisonPaths.map((entry) => ({
    asset: entry.asset,
    color: entry.color,
    point: entry.points[Math.min(hoverIndex, entry.points.length - 1)],
  }));
  const hoverContext = useMemo(() => {
    const point = activeSeries[hoverIndex];
    if (!point) return null;
    const previous = activeSeries[hoverIndex - 1]?.price;
    const first = activeSeries[0]?.price;
    const trailing20 = activeSeries.slice(Math.max(0, hoverIndex - 19), hoverIndex + 1).map((item) => item.price);
    const trailing30 = activeSeries.slice(Math.max(0, hoverIndex - 29), hoverIndex + 1).map((item) => item.price);
    const average20 = mean(trailing20);
    const deviation20 = stdDev(trailing20);
    const average30 = mean(trailing30);
    const deviation30 = stdDev(trailing30);
    const peak = Math.max(...activeSeries.slice(0, hoverIndex + 1).map((item) => item.price));
    return {
      periodReturn: previous ? point.price / previous - 1 : null,
      windowReturn: first ? point.price / first - 1 : null,
      zScore: trailing30.length >= 3 && deviation30 ? (point.price - average30) / deviation30 : null,
      mean20: trailing20.length >= 5 ? average20 : null,
      bandWidth: trailing20.length >= 5 && average20 ? deviation20 * 4 / average20 : null,
      drawdown: peak > 0 ? point.price / peak - 1 : null,
    };
  }, [activeSeries, hoverIndex]);

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!chart.primary.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const ratio = Math.max(0, Math.min(1, (position - LEFT) / (WIDTH - LEFT - RIGHT)));
    const index = Math.round(ratio * (chart.primary.length - 1));
    setHoveredTimestamp(chart.primary[index]?.t ?? null);
  };

  const handleChartKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!chart.primary.length) return;
    const currentIndex = hoveredTimestamp === null
      ? chart.primary.length - 1
      : chart.primary.reduce((best, point, index) => Math.abs(point.t - hoveredTimestamp) < Math.abs((chart.primary[best]?.t ?? 0) - hoveredTimestamp) ? index : best, 0);
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "ArrowRight") nextIndex = Math.min(chart.primary.length - 1, currentIndex + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = chart.primary.length - 1;
    else if (event.key === "Escape") {
      setHoveredTimestamp(null);
      return;
    } else return;
    event.preventDefault();
    setHoveredTimestamp(chart.primary[nextIndex]?.t ?? null);
  };

  return (
    <section className="primary-chart panel-frame" aria-label="Composite market chart" data-tour="chart">
      <div className="chart-command-row">
        <div className="instrument-title">
          <span className="instrument-code">{activeInstrument}</span>
          <span>{ASSET_CATALOG[activeInstrument].label.toUpperCase()}</span>
          <span className="instrument-source">{data?.isFallback ? "CACHED SERIES" : "ACTIVE SERIES"}</span>
        </div>
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
      </div>
      <div className="chart-subcommand-row">
        <div className="mode-switch" role="group" aria-label="Chart display mode">
          {(["price", "return", "zscore"] as const).map((mode) => (
            <button type="button" key={mode} aria-pressed={displayMode === mode} onClick={() => setDisplayMode(mode)}>
              {mode === "zscore" ? "Z-SCORE" : mode.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="series-legend">
          <span><i className="line-key primary" />{activeInstrument}</span>
          {chart.comparisonPaths.map((entry) => (
            <span key={entry.asset}><i className="line-key comparison" style={{ background: entry.color }} />{entry.asset}</span>
          ))}
          <span className="volume-note" title="The current payload contains close prices, not volume.">ACTIVITY PROXY · |RETURN|</span>
        </div>
      </div>
      <div className="compare-command-row">
        <span className="compare-label">COMPARE</span>
        <div className="compare-toggle-group" role="group" aria-label="Comparison instruments">
          {ASSET_IDS.filter((asset) => asset !== activeInstrument).map((asset) => {
            const index = comparisonInstruments.indexOf(asset);
            const isActive = index !== -1;
            const atCap = comparisonInstruments.length >= MAX_COMPARISONS;
            const color = isActive ? COMPARE_PALETTE[index % COMPARE_PALETTE.length]! : undefined;
            return (
              <button
                type="button"
                key={asset}
                className={`compare-toggle${isActive ? " compare-toggle-active" : ""}`}
                aria-pressed={isActive}
                disabled={!isActive && atCap}
                onClick={() => toggleComparison(asset)}
                title={isActive ? `Remove ${asset} from comparison` : atCap ? `Comparison limit reached (${MAX_COMPARISONS})` : `Compare ${asset}`}
              >
                <i className="compare-swatch" style={{ background: color ?? "transparent" }} />
                {asset}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`chart-stage${loading ? " chart-loading" : ""}`}>
        {!chart.primary.length ? <TechnicalSkeleton /> : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            onPointerMove={handlePointer}
            onPointerLeave={() => setHoveredTimestamp(null)}
            onKeyDown={handleChartKeyDown}
            tabIndex={0}
            role="img"
            aria-label={`${activeInstrument} ${displayMode} chart for ${timeWindow} days`}
            aria-describedby="chart-keyboard-help"
          >
            <defs>
              <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--focus)" stopOpacity="0.38" />
                <stop offset="1" stopColor="var(--focus)" stopOpacity="0.05" />
              </linearGradient>
              <clipPath id="priceClip"><rect x={LEFT} y={TOP} width={WIDTH - LEFT - RIGHT} height={PRICE_BOTTOM - TOP} /></clipPath>
            </defs>
            {Array.from({ length: 6 }, (_, index) => {
              const ratio = index / 5;
              const y = TOP + ratio * (PRICE_BOTTOM - TOP);
              const value = chart.high - ratio * (chart.high - chart.low);
              return <g key={index}><line className="grid-line" x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} /><text className="axis-text" x={WIDTH - RIGHT + 10} y={y + 3}>{formatAxis(value, displayMode)}</text></g>;
            })}
            {Array.from({ length: 7 }, (_, index) => {
              const ratio = index / 6;
              const x = LEFT + ratio * (WIDTH - LEFT - RIGHT);
              const point = chart.primary[Math.round(ratio * Math.max(0, chart.primary.length - 1))];
              return <g key={index}><line className="grid-line vertical" x1={x} x2={x} y1={TOP} y2={BOTTOM} /><text className="axis-text" textAnchor={index === 0 ? "start" : index === 6 ? "end" : "middle"} x={x} y={HEIGHT - 4}>{point ? new Date(point.t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase() : ""}</text></g>;
            })}
            <g clipPath="url(#priceClip)">
              {chart.bandArea && <path d={chart.bandArea} className="vol-band" />}
              {chart.midPath && <path d={chart.midPath} className="benchmark-line" />}
              <path d={chart.activePath} className="market-line" />
              {chart.comparisonPaths.map((entry) => entry.path && (
                <path key={entry.asset} d={entry.path} className="market-line compare-line" stroke={entry.color} />
              ))}
              {chart.anomalyIndices.map((index) => <circle key={index} className="anomaly-point" cx={chart.x(index)} cy={chart.y(chart.primary[index]?.value ?? 0)} r="3" />)}
              {chart.primary[chart.troughIndex] && <g className="trough-mark"><line x1={chart.x(chart.troughIndex)} x2={chart.x(chart.troughIndex)} y1={chart.y(chart.primary[chart.troughIndex]!.value)} y2={PRICE_BOTTOM} /><text x={chart.x(chart.troughIndex) + 5} y={PRICE_BOTTOM - 7}>WINDOW LOW</text></g>}
              {chart.primary[chart.maxDrawdownIndex] && chart.maxDrawdown < 0 && <g className="max-dd-mark"><path d={`M${chart.x(chart.maxDrawdownIndex) - 4},${chart.y(chart.primary[chart.maxDrawdownIndex]!.value) - 7} L${chart.x(chart.maxDrawdownIndex) + 4},${chart.y(chart.primary[chart.maxDrawdownIndex]!.value) - 7} L${chart.x(chart.maxDrawdownIndex)},${chart.y(chart.primary[chart.maxDrawdownIndex]!.value) - 1} Z`} /><text x={Math.min(WIDTH - RIGHT - 88, chart.x(chart.maxDrawdownIndex) + 7)} y={Math.max(TOP + 10, chart.y(chart.primary[chart.maxDrawdownIndex]!.value) - 8)}>MAX DD {formatPercent(chart.maxDrawdown)}</text></g>}
            </g>
            <g className="series-end-labels">
              {chart.endLabels.map((label) => (
                <text
                  key={label.asset}
                  className="series-end-label"
                  x={Math.min(WIDTH - 4, label.x + LABEL_OFFSET)}
                  y={label.y + LABEL_FONT_SIZE / 3}
                  fill={label.color}
                >
                  {label.asset}
                </text>
              ))}
            </g>
            <text className="axis-section-label" x={LEFT} y={ACTIVITY_TOP - 7}>MARKET ACTIVITY PROXY</text>
            {chart.returns.map((value, index) => {
              const width = Math.max(1, (WIDTH - LEFT - RIGHT) / Math.max(1, chart.returns.length) - 0.6);
              const height = (value / chart.maxActivity) * (BOTTOM - ACTIVITY_TOP);
              return <rect key={index} x={chart.x(index + 1) - width / 2} y={BOTTOM - height} width={width} height={height} fill="url(#activityFill)" />;
            })}
            {hoverPoint && <g className="crosshair"><line x1={chart.x(hoverIndex)} x2={chart.x(hoverIndex)} y1={TOP} y2={BOTTOM} /><line x1={LEFT} x2={WIDTH - RIGHT} y1={chart.y(hoverPoint.value)} y2={chart.y(hoverPoint.value)} /><circle cx={chart.x(hoverIndex)} cy={chart.y(hoverPoint.value)} r="3" /></g>}
          </svg>
        )}
        {hoverPoint && <div className="chart-tooltip" style={{ left: `${Math.min(76, Math.max(10, (chart.x(hoverIndex) / WIDTH) * 100))}%` }}>
          <span>{formatTimestamp(hoverPoint.t)}</span>
          <b>{activeInstrument} {displayMode === "price" ? formatPrice(hoverPoint.raw) : displayMode === "return" ? formatPercent(hoverPoint.value) : `${formatNumber(hoverPoint.value)}σ`}</b>
          {compareHovers.map(({ asset, color, point }) => point && (
            <b key={asset} className="comparison-text" style={{ color }}>
              <i className="tooltip-swatch" style={{ background: color }} />
              {asset} {displayMode === "price" ? formatPrice(point.raw) : displayMode === "return" ? formatPercent(point.value) : `${formatNumber(point.value)}σ`}
            </b>
          ))}
          {hoverContext && <div className="tooltip-metrics">
            <span>Δ1 <b className={hoverContext.periodReturn !== null && hoverContext.periodReturn >= 0 ? "up" : "down"}>{hoverContext.periodReturn === null ? "N/A" : formatPercent(hoverContext.periodReturn)}</b></span>
            <span>RET <b>{hoverContext.windowReturn === null ? "N/A" : formatPercent(hoverContext.windowReturn)}</b></span>
            <span>Z30 <b>{hoverContext.zScore === null ? "N/A" : formatNumber(hoverContext.zScore)}</b></span>
            <span>DD <b className="down">{hoverContext.drawdown === null ? "N/A" : formatPercent(hoverContext.drawdown)}</b></span>
            <span>MA20 <b>{hoverContext.mean20 === null ? "N/A" : formatPrice(hoverContext.mean20)}</b></span>
            <span>BAND <b>{hoverContext.bandWidth === null ? "N/A" : formatPercent(hoverContext.bandWidth, { sign: false })}</b></span>
          </div>}
        </div>}
        <span id="chart-keyboard-help" className="sr-only">Use left and right arrow keys to move the linked crosshair. Home and End jump to the beginning or end of the series. Escape clears it.</span>
        <span className="sr-only" aria-live="polite">{hoverPoint ? `${formatTimestamp(hoverPoint.t)}, ${activeInstrument}, ${displayMode === "price" ? formatPrice(hoverPoint.raw) : displayMode === "return" ? formatPercent(hoverPoint.value) : `${formatNumber(hoverPoint.value)} standard deviations`}` : "Crosshair cleared"}</span>
      </div>
      <div className="chart-readout">
        <span>OPEN <b>{activeSeries[0] ? formatPrice(activeSeries[0].price) : "—"}</b></span>
        <span>LAST <b>{activeSeries.at(-1) ? formatPrice(activeSeries.at(-1)!.price) : "—"}</b></span>
        <span>HIGH <b>{activeSeries.length ? formatPrice(Math.max(...activeSeries.map((point) => point.price))) : "—"}</b></span>
        <span>LOW <b>{activeSeries.length ? formatPrice(Math.min(...activeSeries.map((point) => point.price))) : "—"}</b></span>
        <span className={chart.gapCount ? "series-quality incomplete" : "series-quality"}>{chart.gapCount ? `SERIES GAPS ${chart.gapCount}` : "SERIES COMPLETE"}</span>
        <span className="method-note">BAND: 20-OBS MEAN ± 2σ</span>
      </div>
    </section>
  );
}

function TimeWindowSelector({ value, onChange }: { value: TimeWindow; onChange: (value: TimeWindow) => void }) {
  const windows: { value: TimeWindow; label: string }[] = [
    { value: 30, label: "30D" }, { value: 60, label: "60D" }, { value: 90, label: "90D" }, { value: 180, label: "180D" }, { value: 365, label: "1Y" },
  ];
  return <div className="window-switch" role="group" aria-label="Time window">{windows.map((window) => <button type="button" key={window.value} aria-pressed={value === window.value} onClick={() => onChange(window.value)}>{window.label}<kbd>{windows.indexOf(window) + 1}</kbd></button>)}</div>;
}

function TechnicalSkeleton() {
  return <div className="technical-skeleton" aria-label="Loading market series"><span>ACQUIRING SERIES</span>{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ width: `${38 + index * 7}%` }} />)}</div>;
}
