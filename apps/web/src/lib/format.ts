// Formatting helpers. Every number rendered in the UI should flow through
// one of these so sign, decimals, and separators stay consistent.

const MINUS = "−"; // real minus sign, not hyphen-minus

export function formatPrice(value: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? (value >= 100 ? 2 : 4);
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `${MINUS}${formatted}` : formatted;
}

export function formatPercent(value: number, opts: { decimals?: number; sign?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  const withSign = opts.sign ?? true;
  const pct = value * 100;
  const abs = Math.abs(pct);
  const formatted = abs.toFixed(decimals);
  if (!withSign) return `${formatted}%`;
  if (pct > 0) return `+${formatted}%`;
  if (pct < 0) return `${MINUS}${formatted}%`;
  return `${formatted}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  const abs = Math.abs(value);
  const formatted = abs.toFixed(decimals);
  return value < 0 ? `${MINUS}${formatted}` : formatted;
}

export function signClass(value: number): "up" | "down" | "flat" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function trendArrow(value: number): string {
  if (value > 0) return "▲"; // ▲
  if (value < 0) return "▼"; // ▼
  return "–"; // –
}
