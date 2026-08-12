"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSalesData } from "@/hooks/use-sales-data";
import { createReportRequestLifecycle } from "@/hooks/report-request-lifecycle";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import { getChartData } from "@/modules/metrics/chart-data";
import { computeDataSummary } from "@/modules/metrics/metric-engine";
import { requestWeeklyReport } from "@/modules/reports/report-client";
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
  const reportRequestRef = useRef<ReturnType<
    typeof createReportRequestLifecycle
  > | null>(null);
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

  const invalidateReportRequest = useCallback(() => {
    reportRequestRef.current?.deactivate();
    reportRequestRef.current = null;
    setGeneratedReport(null);
  }, []);

  const changeSelectedStore = useCallback(
    (value: string) => {
      invalidateReportRequest();
      setSelectedStore(value);
    },
    [invalidateReportRequest]
  );
  const changeCompareStores = useCallback(
    (value: string[]) => {
      invalidateReportRequest();
      setCompareStores(value);
    },
    [invalidateReportRequest]
  );
  const changeStartDate = useCallback(
    (value: string) => {
      invalidateReportRequest();
      setStartDate(value);
    },
    [invalidateReportRequest]
  );
  const changeEndDate = useCallback(
    (value: string) => {
      invalidateReportRequest();
      setEndDate(value);
    },
    [invalidateReportRequest]
  );

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
          const scopeKey = `${[...reportStoreIds].sort().join(",")}|${authorized.startDate}|${authorized.endDate}`;
          reportRequestRef.current?.deactivate();
          const lifecycle = createReportRequestLifecycle();
          reportRequestRef.current = lifecycle;
          setGeneratedReport(null);
          void requestWeeklyReport({
            startDate: authorized.startDate,
            endDate: authorized.endDate,
            storeIds: reportStoreIds,
          })
            .then((html) =>
              lifecycle.runIfActive(() => {
                setGeneratedReport({ html, scopeKey });
                setInsightView("report");
              })
            )
            .catch((error: unknown) => {
              lifecycle.runIfActive(() => {
                console.error(
                  "Failed to request weekly report:",
                  error instanceof Error ? error.message : "UnknownError"
                );
              });
            });
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
    setCompareStores: changeCompareStores,
    setEndDate: changeEndDate,
    setInsightView,
    setSelectedStore: changeSelectedStore,
    setStartDate: changeStartDate,
    startDate,
    applyIntentMetadata,
  };
}
