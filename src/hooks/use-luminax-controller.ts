"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSalesData } from "@/hooks/use-sales-data";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import { getChartData } from "@/modules/metrics/chart-data";
import { computeDataSummary } from "@/modules/metrics/metric-engine";
import { generateWeeklyReportHTML } from "@/modules/reports/report-engine";
import {
  type IntentViewMetadata,
} from "@/modules/chat/view-router";
import { buildDashboardChartOptions } from "@/modules/visualization/chart-options";
import { authorizeIntentMetadata } from "@/modules/workbench/workbench-intent-policy";
import {
  resolveInsightView,
  type InsightView,
} from "@/modules/workbench/workbench-presentation";
import type { WorkbenchContext } from "@/modules/workbench/workbench-types";

interface GeneratedReport {
  html: string;
  scopeKey: string;
}

export function useLuminaXController(context: WorkbenchContext | null) {
  const { salesData, loading, error, reload } = useSalesData(context !== null);
  const [insightView, setInsightView] = useState<InsightView>("overview");
  const [generatedReport, setGeneratedReport] =
    useState<GeneratedReport | null>(null);
  const [selectedStore, setSelectedStore] = useState("all");
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [compareStores, setCompareStores] = useState<string[]>([]);

  const authorizedStores = useMemo(() => {
    if (!salesData || context === null) return [];
    return salesData.store_master.filter((store) =>
      context.availableStoreIds.includes(store.store_id)
    );
  }, [context, salesData]);

  const activeStoreIds = useMemo(() => {
    const allowedIds = authorizedStores.map((store) => store.store_id);
    if (compareStores.length > 0) {
      return compareStores.filter((storeId) => allowedIds.includes(storeId));
    }
    return selectedStore === "all" && allowedIds.length > 0
      ? allowedIds
      : allowedIds.includes(selectedStore)
        ? [selectedStore]
        : [];
  }, [authorizedStores, compareStores, selectedStore]);

  useEffect(() => {
    const allowedIds = new Set(
      authorizedStores.map((store) => store.store_id)
    );
    setCompareStores((storeIds) => {
      const nextStoreIds = storeIds.filter((storeId) =>
        allowedIds.has(storeId)
      );
      return nextStoreIds.length === storeIds.length
        ? storeIds
        : nextStoreIds;
    });
    setSelectedStore((storeId) =>
      storeId === "all" || allowedIds.has(storeId) ? storeId : "all"
    );
  }, [authorizedStores]);

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

  const currentReportScopeKey = useMemo(
    () =>
      `${[...activeStoreIds].sort().join(",")}|${startDate}|${endDate}`,
    [activeStoreIds, endDate, startDate]
  );
  const reportHTML =
    generatedReport?.scopeKey === currentReportScopeKey
      ? generatedReport.html
      : "";

  const applyIntentMetadata = useCallback(
    (metadata: IntentViewMetadata) => {
      if (context === null) return;
      const authorized = authorizeIntentMetadata(metadata, context);
      if (!authorized) return;
      const nextView = resolveInsightView(authorized.intent);

      if (nextView === "report") {
        const reportStoreIds =
          authorized.storeIds.length > 0
            ? authorized.storeIds
            : activeStoreIds;
        if (salesData && reportStoreIds.length > 0) {
          const coversAllAuthorizedStores =
            reportStoreIds.length === authorizedStores.length &&
            authorizedStores.every((store) =>
              reportStoreIds.includes(store.store_id)
            );
          if (coversAllAuthorizedStores) {
            setCompareStores([]);
            setSelectedStore("all");
          } else if (reportStoreIds.length >= 2) {
            setCompareStores(reportStoreIds);
            setSelectedStore("all");
          } else {
            setCompareStores([]);
            setSelectedStore(reportStoreIds[0]);
          }
          setStartDate(authorized.startDate);
          setEndDate(authorized.endDate);
          setGeneratedReport({
            html: generateWeeklyReportHTML(
              salesData,
              authorized.startDate,
              authorized.endDate,
              reportStoreIds
            ),
            scopeKey: `${[...reportStoreIds].sort().join(",")}|${authorized.startDate}|${authorized.endDate}`,
          });
          setInsightView("report");
        }
        return;
      }

      if (authorized.storeIds.length >= 2) {
        setCompareStores(authorized.storeIds);
        setSelectedStore("all");
      } else if (authorized.storeIds.length === 1) {
        setCompareStores([]);
        setSelectedStore(authorized.storeIds[0]);
      }
      setStartDate(authorized.startDate);
      setEndDate(authorized.endDate);
      setInsightView(nextView);
    },
    [activeStoreIds, authorizedStores, context, salesData]
  );

  return {
    activeStoreIds,
    authorizedStores,
    chartOptions,
    compareStores,
    dataSummary,
    endDate,
    error,
    insightView,
    loading,
    reportHTML,
    reload,
    salesData,
    selectedStore,
    setCompareStores,
    setEndDate,
    setInsightView,
    setSelectedStore,
    setStartDate,
    startDate,
    applyIntentMetadata,
  };
}
