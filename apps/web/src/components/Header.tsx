import { formatTime } from "../lib/format";

interface HeaderProps {
  loading: boolean;
  isFallback: boolean;
  generatedAt?: string;
}

export function Header({ loading, isFallback, generatedAt }: HeaderProps) {
  return (
    <header className="header">
      <div className="wordmark-row">
        <span className="seal" aria-hidden="true">
          脉
        </span>
        <span className="wordmark">PULSO</span>
        <span className={`wordmark-underline${loading ? " pulsing" : ""}`} aria-hidden="true" />
      </div>
      <div className="status" role="status" aria-live="polite">
        <span className={`status-dot${isFallback ? " cached" : ""}`} aria-hidden="true" />
        <span className="mono">
          {loading
            ? "SYNCING…"
            : `${isFallback ? "CACHED" : "LIVE"} · ${generatedAt ? formatTime(generatedAt) : "—"}`}
        </span>
      </div>
    </header>
  );
}
