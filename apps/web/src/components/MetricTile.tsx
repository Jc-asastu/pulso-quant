import { trendArrow } from "../lib/format";

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string;
  subSign?: "up" | "down" | "flat";
  pending?: boolean;
}

export function MetricTile({ label, value, sub, subSign = "flat", pending = false }: MetricTileProps) {
  return (
    <div className="cell">
      <div className="tile-label">{label}</div>
      <div className={`tile-value${pending ? " pending" : ""}`}>{pending ? "—" : value}</div>
      {sub && !pending && (
        <div className={`tile-sub ${subSign}`}>
          <span className="arrow" aria-hidden="true">
            {trendArrow(subSign === "up" ? 1 : subSign === "down" ? -1 : 0)}
          </span>
          {sub}
        </div>
      )}
    </div>
  );
}
