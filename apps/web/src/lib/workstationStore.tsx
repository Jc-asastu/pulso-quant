import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssetId } from "@pulso/shared";

export type TimeWindow = 30 | 60 | 90 | 180 | 365;
export type DisplayMode = "price" | "return" | "zscore";
export type LowerView = "correlation" | "drawdown" | "relative" | "scatter" | "events";
export type ConnectionState = "loading" | "live" | "cached" | "stale" | "error" | "disconnected";

export const MAX_COMPARISONS = 8;

interface WorkstationState {
  activeInstrument: AssetId;
  comparisonInstruments: AssetId[];
  timeWindow: TimeWindow;
  hoveredTimestamp: number | null;
  selectedMetric: string | null;
  connectionState: ConnectionState;
  displayMode: DisplayMode;
  lowerView: LowerView;
  selectedPair: [AssetId, AssetId] | null;
}

interface WorkstationContextValue extends WorkstationState {
  setActiveInstrument: (asset: AssetId) => void;
  toggleComparison: (asset: AssetId) => void;
  clearComparisons: () => void;
  setTimeWindow: (window: TimeWindow) => void;
  setHoveredTimestamp: (timestamp: number | null) => void;
  setSelectedMetric: (metric: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setLowerView: (view: LowerView) => void;
  setSelectedPair: (pair: [AssetId, AssetId] | null) => void;
  clearSelection: () => void;
}

const WorkstationContext = createContext<WorkstationContextValue | null>(null);

export function LinkedCrosshairProvider({ children }: { children: ReactNode }) {
  const [activeInstrument, setActiveInstrumentState] = useState<AssetId>("BTC");
  const [comparisonInstruments, setComparisonInstruments] = useState<AssetId[]>(["ETH"]);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(90);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("loading");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("price");
  const [lowerView, setLowerView] = useState<LowerView>("correlation");
  const [selectedPair, setSelectedPair] = useState<[AssetId, AssetId] | null>(null);

  const setActiveInstrument = (asset: AssetId) => {
    setActiveInstrumentState(asset);
    setComparisonInstruments((current) => current.includes(asset) ? current.filter((item) => item !== asset) : current);
  };

  const toggleComparison = (asset: AssetId) => {
    if (asset === activeInstrument) return;
    setComparisonInstruments((current) => {
      if (current.includes(asset)) return current.filter((item) => item !== asset);
      if (current.length >= MAX_COMPARISONS) return current;
      return [...current, asset];
    });
  };

  const clearComparisons = () => setComparisonInstruments([]);

  const value = useMemo<WorkstationContextValue>(() => ({
    activeInstrument,
    comparisonInstruments,
    timeWindow,
    hoveredTimestamp,
    selectedMetric,
    connectionState,
    displayMode,
    lowerView,
    selectedPair,
    setActiveInstrument,
    toggleComparison,
    clearComparisons,
    setTimeWindow,
    setHoveredTimestamp,
    setSelectedMetric,
    setConnectionState,
    setDisplayMode,
    setLowerView,
    setSelectedPair,
    clearSelection: () => {
      setComparisonInstruments([]);
      setSelectedPair(null);
      setHoveredTimestamp(null);
      setSelectedMetric(null);
    },
  }), [activeInstrument, comparisonInstruments, timeWindow, hoveredTimestamp, selectedMetric, connectionState, displayMode, lowerView, selectedPair]);

  return <WorkstationContext.Provider value={value}>{children}</WorkstationContext.Provider>;
}

export function useWorkstation(): WorkstationContextValue {
  const value = useContext(WorkstationContext);
  if (!value) throw new Error("useWorkstation must be used inside LinkedCrosshairProvider");
  return value;
}
