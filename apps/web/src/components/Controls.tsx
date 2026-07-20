import type { AssetId } from "@pulso/shared";
import { ASSET_CATALOG, ASSET_IDS } from "@pulso/shared";

const DAY_OPTIONS = [30, 90, 365] as const;

interface ControlsProps {
  selectedAssets: AssetId[];
  onToggleAsset: (asset: AssetId) => void;
  days: number;
  onSetDays: (days: number) => void;
}

export function Controls({ selectedAssets, onToggleAsset, days, onSetDays }: ControlsProps) {
  return (
    <div className="controls">
      <div className="control-group" role="group" aria-label="Asset selection">
        <span className="control-label">Assets</span>
        {ASSET_IDS.map((id) => {
          const active = selectedAssets.includes(id);
          return (
            <button
              key={id}
              type="button"
              className="control-btn"
              aria-pressed={active}
              aria-label={`${active ? "Hide" : "Show"} ${ASSET_CATALOG[id].label}`}
              onClick={() => onToggleAsset(id)}
            >
              {id}
            </button>
          );
        })}
      </div>
      <div className="control-group" role="group" aria-label="Time window">
        <span className="control-label">Window</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            className="control-btn"
            aria-current={days === d}
            onClick={() => onSetDays(d)}
          >
            {d}D
          </button>
        ))}
      </div>
    </div>
  );
}
