import { useEffect, useRef, useState } from "react";
import type { AssetId, DashboardResponse } from "@pulso/shared";
import { fetchDashboard } from "./api";

interface DashboardState {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
}

export function useDashboard(assets: AssetId[], days: number): DashboardState {
  const [state, setState] = useState<DashboardState>({ data: null, loading: true, error: null });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (assets.length === 0) {
      setState({ data: null, loading: false, error: "Select at least one asset." });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchDashboard(assets, days, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: e instanceof Error ? e.message : "Unknown error" });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.join(","), days]);

  return state;
}
