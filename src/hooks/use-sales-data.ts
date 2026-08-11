"use client";

import { useEffect, useState } from "react";
import { createWorkbenchContextRequestLifecycle } from "./workbench-context-lifecycle";
import type { SalesData } from "@/modules/domain/sales-data";

export function useSalesData(enabled: boolean) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const lifecycle = createWorkbenchContextRequestLifecycle();
    setLoading(true);
    setError(null);

    fetch("/api/data", { cache: "no-store", signal: controller.signal })
      .then(readSalesDataResponse)
      .then((data) =>
        lifecycle.runIfActive(() => {
          setSalesData(data);
          setError(null);
        })
      )
      .catch((reason: unknown) => {
        if ((reason as Error).name === "AbortError") return;
        lifecycle.runIfActive(() => setError("经营数据暂时不可用"));
      })
      .finally(() => lifecycle.runIfActive(() => setLoading(false)));

    return () => {
      lifecycle.deactivate();
      controller.abort();
    };
  }, [enabled, requestVersion]);

  return {
    salesData,
    loading,
    error,
    reload: () => setRequestVersion((value) => value + 1),
  };
}

async function readSalesDataResponse(response: Response): Promise<SalesData> {
  if (response.status === 401) {
    window.location.replace("/login?next=/");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error("Data request failed");
  return response.json() as Promise<SalesData>;
}
