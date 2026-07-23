import { useEffect, useRef, useState } from "react";
import type { AssetId, DashboardResponse } from "@pulso/shared";
import { fetchDashboard } from "./api";

interface DashboardState {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  responseMs: number | null;
}

export function useDashboard(assets: AssetId[], days: number): DashboardState {
  const [state, setState] = useState<DashboardState>({ data: null, loading: true, error: null, responseMs: null });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (assets.length === 0) {
      setState({ data: null, loading: false, error: "Select at least one asset.", responseMs: null });
      return;
    }

    let disposed = false;
    const load = () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const startedAt = performance.now();
      fetchDashboard(assets, days, controller.signal)
        .then((data) => {
          if (disposed || controller.signal.aborted) return;
          setState({ data, loading: false, error: null, responseMs: performance.now() - startedAt });
        })
        .catch((e: unknown) => {
          if (disposed || controller.signal.aborted) return;
          setState((prev) => ({ ...prev, loading: false, error: e instanceof Error ? e.message : "Unknown error", responseMs: null }));
        });
    };

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.join(","), days]);

  return state;
}
