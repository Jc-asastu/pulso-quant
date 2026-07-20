import type { CorrelationMatrix } from "@pulso/shared";
import { formatNumber } from "../lib/format";

interface CorrelationHeatmapProps {
  correlation: CorrelationMatrix;
}

function cellColor(value: number, isDiagonal: boolean): string {
  if (isDiagonal) return "var(--panel-2)";
  if (value >= 0) return `rgba(67, 169, 125, ${Math.min(Math.abs(value) * 0.55, 0.55)})`;
  return `rgba(212, 100, 92, ${Math.min(Math.abs(value) * 0.55, 0.55)})`;
}

function textColor(value: number, isDiagonal: boolean): string {
  if (isDiagonal) return "var(--faint)";
  return Math.abs(value) >= 0.75 ? "#0a0e12" : "var(--ink)";
}

export function CorrelationHeatmap({ correlation }: CorrelationHeatmapProps) {
  const { assets, matrix } = correlation;
  const n = assets.length;

  if (n === 0) {
    return <div className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>Not enough data.</div>;
  }

  return (
    <div>
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `48px repeat(${n}, 1fr)` }}
        role="table"
        aria-label="Correlation matrix between selected assets"
      >
        <div className="heatmap-cell" aria-hidden="true" style={{ background: "var(--panel)" }} />
        {assets.map((a) => (
          <div key={`col-${a}`} className="heatmap-axis" role="columnheader">
            {a}
          </div>
        ))}
        {assets.map((rowAsset, i) => (
          <div key={`row-${rowAsset}`} style={{ display: "contents" }}>
            <div className="heatmap-axis" role="rowheader">
              {rowAsset}
            </div>
            {assets.map((colAsset, j) => {
              const value = matrix[i]?.[j] ?? 0;
              const isDiagonal = i === j;
              return (
                <div
                  key={`${rowAsset}-${colAsset}`}
                  className={`heatmap-cell${isDiagonal ? " diagonal" : ""}`}
                  role="cell"
                  style={{ background: cellColor(value, isDiagonal), color: textColor(value, isDiagonal) }}
                  aria-label={`${rowAsset} vs ${colAsset}: ${formatNumber(value, 2)}`}
                  title={`${rowAsset} × ${colAsset}: ${formatNumber(value, 2)}`}
                >
                  {formatNumber(value, 2)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
