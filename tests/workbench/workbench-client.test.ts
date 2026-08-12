import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeBar } from "../../src/components/luminax/workbench/ScopeBar";
import {
  WorkbenchContextClientError,
  normalizeWorkbenchContext,
} from "../../src/modules/workbench/workbench-context-client";
import { authorizeIntentMetadata } from "../../src/modules/workbench/workbench-intent-policy";
import {
  getMetricLabel,
  getSuggestedQuestions,
  getVisibleInsightSections,
  getWorkbenchCopy,
} from "../../src/modules/workbench/workbench-presentation";
import { createWorkbenchContextRequestLifecycle } from "../../src/hooks/workbench-context-lifecycle";
import type { WorkbenchContext } from "../../src/modules/workbench/workbench-types";
import {
  ReportClientError,
  requestWeeklyReport,
} from "../../src/modules/reports/report-client";
import { createReportRequestLifecycle } from "../../src/hooks/report-request-lifecycle";

test("client context normalizes templates without widening authorization", () => {
  assert.deepEqual(
    normalizeWorkbenchContext({
      templateId: "future_template",
      availableStoreIds: ["S001", "S001"],
      availableMetricCodes: ["achievement_rate"],
      availableIntents: ["achievement_rate"],
      canAccessAdmin: false,
    }),
    {
      templateId: "default",
      availableStoreIds: ["S001"],
      availableMetricCodes: ["achievement_rate"],
      availableIntents: ["achievement_rate"],
      canAccessAdmin: false,
    }
  );
});

test("client context rejects missing permission collections", () => {
  assert.throws(
    () => normalizeWorkbenchContext({ templateId: "default" }),
    WorkbenchContextClientError
  );
});

test("stale request completion cannot clear the newer request loading state", () => {
  const staleRequest = createWorkbenchContextRequestLifecycle();
  const currentRequest = createWorkbenchContextRequestLifecycle();
  let isLoading = false;

  staleRequest.deactivate();
  currentRequest.runIfActive(() => {
    isLoading = true;
  });

  assert.equal(
    staleRequest.runIfActive(() => {
      isLoading = false;
    }),
    false
  );
  assert.equal(isLoading, true);
});

test("AI intent metadata is intersected with the current workbench context", () => {
  const context = createClientContext();
  assert.deepEqual(
    authorizeIntentMetadata(
      {
        intent: "compare",
        storeIds: ["S001", "S999"],
        startDate: "2025-05-01",
        endDate: "2025-05-07",
      },
      context
    ),
    {
      intent: "compare",
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-07",
    }
  );
  assert.equal(
    authorizeIntentMetadata(
      {
        intent: "report",
        storeIds: ["S001"],
        startDate: "2025-05-01",
        endDate: "2025-05-07",
      },
      context
    ),
    null
  );
});

test("presentation selectors expose only metric-backed sections", () => {
  assert.deepEqual(
    getVisibleInsightSections(["achievement_rate", "channel_mix"]),
    ["totalSales", "achievement", "salesTrend", "channel"]
  );
  assert.equal(getWorkbenchCopy("regional_manager").title, "辖区经营概览");
});

test("authorization rejects explicit irrelevant intent", () => {
  assert.equal(
    authorizeIntentMetadata(
      {
        intent: "irrelevant",
        storeIds: [],
        startDate: "2025-05-01",
        endDate: "2025-05-07",
      },
      {
        ...createClientContext(),
        availableIntents: ["irrelevant"],
      } as unknown as WorkbenchContext
    ),
    null
  );
});

test("visible sections are deduplicated and follow the fixed order", () => {
  assert.deepEqual(
    getVisibleInsightSections([
      "anomaly_detection",
      "achievement_rate",
      "aov_trend",
    ]),
    ["totalSales", "achievement", "orders", "aov", "salesTrend", "refund"]
  );
});

test("suggested questions preserve intent order and stop after three", () => {
  const context = createClientContext();
  context.availableIntents = [
    "report",
    "compare",
    "channel_mix",
    "achievement_rate",
  ];

  assert.deepEqual(getSuggestedQuestions(context), [
    "生成当前范围的经营周报",
    "对比当前范围内的门店表现",
    "分析当前范围的渠道结构",
  ]);
});

test("unknown metric labels are returned unchanged", () => {
  assert.equal(getMetricLabel("custom_metric_42"), "custom_metric_42");
});

test("scope bar keeps the aggregate authorized-store scope selectable", () => {
  const html = renderToStaticMarkup(
    createElement(ScopeBar, {
      stores: [
        {
          store_id: "S001",
          store_name: "Store One",
          region: "East",
          city: "Shanghai",
          store_type: "Mall",
          opening_date: "2025-01-01",
          area_type: "Commercial",
        },
      ],
      availableMetricCodes: [],
      selectedStore: "all",
      compareStores: [],
      startDate: "2025-05-01",
      endDate: "2025-05-14",
      onSelectedStoreChange: () => undefined,
      onCompareStoresChange: () => undefined,
      onStartDateChange: () => undefined,
      onEndDateChange: () => undefined,
    })
  );

  assert.match(html, /<option value="all" selected="">/);
});

test("weekly report client sends only the authorized report scope", async (context) => {
  let body: unknown;
  context.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ html: "<!DOCTYPE html><p>report</p>" });
  });

  const html = await requestWeeklyReport({
    startDate: "2025-05-01",
    endDate: "2025-05-14",
    storeIds: ["S001"],
  });

  assert.equal(html, "<!DOCTYPE html><p>report</p>");
  assert.deepEqual(body, {
    startDate: "2025-05-01",
    endDate: "2025-05-14",
    storeIds: ["S001"],
  });
});

test("weekly report client preserves permission errors and rejects invalid HTML payloads", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "没有周报权限" }, { status: 403 })
  );
  await assert.rejects(
    requestWeeklyReport({
      startDate: "2025-05-01",
      endDate: "2025-05-14",
      storeIds: ["S001"],
    }),
    (error: unknown) =>
      error instanceof ReportClientError &&
      error.status === 403 &&
      error.message === "没有周报权限"
  );

  context.mock.restoreAll();
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ html: "" })
  );
  await assert.rejects(
    requestWeeklyReport({
      startDate: "2025-05-01",
      endDate: "2025-05-14",
      storeIds: ["S001"],
    }),
    ReportClientError
  );
});

test("stale report request cannot overwrite a newer scope", () => {
  const stale = createReportRequestLifecycle();
  const current = createReportRequestLifecycle();
  let html = "";

  stale.deactivate();
  current.runIfActive(() => {
    html = "new report";
  });
  stale.runIfActive(() => {
    html = "stale report";
  });

  assert.equal(html, "new report");
});

function createClientContext(): WorkbenchContext {
  return {
    templateId: "regional_manager",
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate", "channel_mix"],
    availableIntents: ["achievement_rate", "channel_mix", "compare"],
    canAccessAdmin: false,
  };
}
