"use client";

import { useCallback, useMemo, useState } from "react";
import { useSalesData } from "@/hooks/use-sales-data";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import type { ViewMode } from "@/modules/domain/ui-types";
import { getChartData } from "@/modules/metrics/chart-data";
import { computeDataSummary } from "@/modules/metrics/metric-engine";
import { generateWeeklyReportHTML } from "@/modules/reports/report-engine";
import {
  resolveIntentView,
  type IntentViewMetadata,
} from "@/modules/chat/view-router";
import { buildDashboardChartOptions } from "@/modules/visualization/chart-options";

export function useLuminaXController() {
  const { salesData, loading } = useSalesData();
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [reportHTML, setReportHTML] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [compareStores, setCompareStores] = useState<string[]>([]);

  const activeStoreIds = useMemo(() => {
    if (compareStores.length > 0) return compareStores;
    if (selectedStore === "all" && salesData) {
      return salesData.store_master.map((store) => store.store_id);
    }
    return [selectedStore];
  }, [compareStores, selectedStore, salesData]);

  const dataSummary = useMemo(
    () =>
      salesData
        ? computeDataSummary(activeStoreIds, startDate, endDate, salesData)
        : null,
    [activeStoreIds, endDate, salesData, startDate]
  );

  const chartData = useMemo(
    () =>
      salesData
        ? getChartData(activeStoreIds, startDate, endDate, salesData)
        : null,
    [activeStoreIds, endDate, salesData, startDate]
  );

  const chartOptions = useMemo(
    () =>
      buildDashboardChartOptions({
        chartData,
        selectedStore,
        compareStores,
      }),
    [chartData, compareStores, selectedStore]
  );

  const applyIntentMetadata = useCallback(
    (metadata: IntentViewMetadata) => {
      const nextViewMode = resolveIntentView(metadata.intent);

      if (nextViewMode === "report") {
        if (salesData) {
          setReportHTML(
            generateWeeklyReportHTML(
              salesData,
              metadata.startDate,
              metadata.endDate
            )
          );
          setViewMode("report");
        }
        return;
      }

      if (nextViewMode === "dashboard") {
        if (metadata.storeIds.length >= 2) {
          setCompareStores(metadata.storeIds);
          setSelectedStore("all");
        } else if (metadata.storeIds.length === 1) {
          setCompareStores([]);
          setSelectedStore(metadata.storeIds[0]);
        }
        setStartDate(metadata.startDate);
        setEndDate(metadata.endDate);
        setViewMode("dashboard");
        return;
      }

      setViewMode("chat");
    },
    [salesData]
  );

  return {
    activeStoreIds,
    chartOptions,
    compareStores,
    dataSummary,
    endDate,
    loading,
    reportHTML,
    salesData,
    selectedStore,
    setCompareStores,
    setEndDate,
    setSelectedStore,
    setStartDate,
    setViewMode,
    startDate,
    viewMode,
    applyIntentMetadata,
  };
}
