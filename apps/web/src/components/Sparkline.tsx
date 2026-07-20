import { useId, useMemo } from "react";
import type { PricePoint } from "@pulso/shared";

interface SparklineProps {
  points: PricePoint[];
  width?: number;
  height?: number;
  label: string;
}

/**
 * Hand-rolled SVG sparkline with an area fill and a dashed baseline at the
 * series' first value. No charting library — this is a deliberate flex on
 * the frontend of a "no generic AI aesthetic" brief.
 */
export function Sparkline({ points, width = 320, height = 40, label }: SparklineProps) {
  const gradientId = useId();

  const { linePath, areaPath, baselineY, terminal } = useMemo(() => {
    if (points.length < 2) {
      return { linePath: "", areaPath: "", baselineY: height / 2, terminal: null };
    }
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const pad = 4;
    const innerH = height - pad * 2;

    const xFor = (i: number) => (i / (points.length - 1)) * width;
    const yFor = (price: number) => pad + innerH - ((price - min) / range) * innerH;

    const coords = points.map((p, i) => [xFor(i), yFor(p.price)] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    const baseline = yFor(points[0]!.price);
    const last = coords[coords.length - 1]!;

    return { linePath: line, areaPath: area, baselineY: baseline, terminal: { x: last[0], y: last[1] } };
  }, [points, width, height]);

  if (points.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${label}: not enough data`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--hair)" strokeWidth={1} />
      </svg>
    );
  }

  const first = points[0]!.price;
  const last = points[points.length - 1]!.price;
  const changeDesc = last >= first ? "up" : "down";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label} sparkline, trending ${changeDesc} over the period`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--muted)" stopOpacity={0.12} />
          <stop offset="100%" stopColor="var(--muted)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <line
        x1={0}
        y1={baselineY}
        x2={width}
        y2={baselineY}
        stroke="var(--hair)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke="var(--muted)" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {terminal && <circle cx={terminal.x} cy={terminal.y} r={2.5} fill="var(--accent)" />}
    </svg>
  );
}
