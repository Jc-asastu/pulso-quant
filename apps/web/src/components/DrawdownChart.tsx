import { useMemo } from "react";
import { formatPercent } from "../lib/format";

interface DrawdownPoint {
  t: number;
  value: number; // <= 0
}

interface DrawdownChartProps {
  curve: DrawdownPoint[];
  maxDrawdown: number;
  width?: number;
  height?: number;
}

/**
 * Hand-rolled drawdown chart: area hangs down from a 0% baseline at the
 * top, deepest point annotated with its value.
 */
export function DrawdownChart({ curve, maxDrawdown, width = 1100, height = 160 }: DrawdownChartProps) {
  const gutter = 46;
  const chartWidth = width - gutter;

  const { areaPath, linePath, deepestPoint, yTicks } = useMemo(() => {
    if (curve.length < 2) {
      return { areaPath: "", linePath: "", deepestPoint: null, yTicks: [] as { y: number; label: string }[] };
    }
    const minVal = Math.min(...curve.map((c) => c.value), maxDrawdown, 0);
    const floor = Math.min(minVal, -0.01);
    const pad = 6;
    const innerH = height - pad * 2;

    const xFor = (i: number) => gutter + (i / (curve.length - 1)) * chartWidth;
    const yFor = (v: number) => pad + (v / floor) * innerH; // v<=0, floor<0 -> yFor(0)=pad

    const coords = curve.map((c, i) => [xFor(i), yFor(c.value)] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const zeroY = yFor(0);
    const area = `${line} L${coords[coords.length - 1]![0].toFixed(2)},${zeroY} L${coords[0]![0].toFixed(2)},${zeroY} Z`;

    let deepestIdx = 0;
    curve.forEach((c, i) => {
      if (c.value < curve[deepestIdx]!.value) deepestIdx = i;
    });
    const deepest = {
      x: coords[deepestIdx]![0],
      y: coords[deepestIdx]![1],
      value: curve[deepestIdx]!.value,
    };

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = (floor * i) / tickCount;
      return { y: yFor(v), label: formatPercent(v, { decimals: 0 }) };
    });

    return { areaPath: area, linePath: line, deepestPoint: deepest, yTicks: ticks };
  }, [curve, maxDrawdown, chartWidth, height]);

  if (curve.length < 2) {
    return <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>Not enough data.</div>;
  }

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Drawdown curve; maximum drawdown ${formatPercent(maxDrawdown)}`}
      preserveAspectRatio="none"
    >
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={gutter} y1={tick.y} x2={width} y2={tick.y} stroke="var(--hair)" strokeWidth={1} />
          <text x={gutter - 8} y={tick.y + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={10} fill="var(--faint)">
            {tick.label}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="var(--down)" fillOpacity={0.16} stroke="none" />
      <path d={linePath} fill="none" stroke="var(--down)" strokeWidth={1} />
      {deepestPoint && (
        <g>
          <circle cx={deepestPoint.x} cy={deepestPoint.y} r={2.5} fill="var(--down)" />
          <text
            x={Math.min(deepestPoint.x + 6, width - 60)}
            y={Math.max(deepestPoint.y - 6, 12)}
            fontFamily="var(--font-mono)"
            fontSize={10}
            fill="var(--down)"
          >
            {formatPercent(deepestPoint.value)}
          </text>
        </g>
      )}
    </svg>
  );
}
