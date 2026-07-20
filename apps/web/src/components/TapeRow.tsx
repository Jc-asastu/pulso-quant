import type { AssetId, PricePoint } from "@pulso/shared";
import { Sparkline } from "./Sparkline";
import { formatPrice, formatPercent, signClass } from "../lib/format";

interface TapeRowProps {
  asset: AssetId;
  points: PricePoint[];
  lastPrice: number;
  windowReturn: number;
}

export function TapeRow({ asset, points, lastPrice, windowReturn }: TapeRowProps) {
  return (
    <div className="tape-row">
      <div className="tape-asset">{asset}</div>
      <div className="tape-chart">
        <Sparkline points={points} width={520} height={44} label={asset} />
      </div>
      <div className="tape-right">
        <div className="tape-price num">{formatPrice(lastPrice)}</div>
        <div className={`tape-change num ${signClass(windowReturn)}`}>{formatPercent(windowReturn)}</div>
      </div>
    </div>
  );
}
