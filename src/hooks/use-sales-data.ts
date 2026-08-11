"use client";

import { useEffect, useState } from "react";
import type { SalesData } from "@/modules/domain/sales-data";

export function useSalesData() {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then((res) => {
        if (res.status === 401) {
          window.location.replace("/login?next=/");
          throw new Error("Authentication required");
        }
        if (!res.ok) throw new Error("Data request failed");
        return res.json();
      })
      .then((data: SalesData) => {
        setSalesData(data);
        setError(null);
      })
      .catch(() => setError("Data not loaded"))
      .finally(() => setLoading(false));
  }, []);

  return { salesData, loading, error };
}
