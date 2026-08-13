import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeBar } from "../../src/components/luminax/workbench/ScopeBar";
import { InsightCanvas } from "../../src/components/luminax/workbench/InsightCanvas";
import { InsightActionPanel } from "../../src/components/luminax/workbench/InsightActionPanel";
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
import type { InsightSnapshotDto } from "../../src/modules/insights/insight-types";
import type { DashboardChartOptions } from "../../src/modules/visualization/chart-theme";

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

test("insight canvas exposes the renamed tab", () => {
  const html = renderToStaticMarkup(
    createElement(InsightCanvas, {
      view: "analysis",
      templateId: "regional_manager",
      availableMetricCodes: [],
      dataSummary: null,
      chartOptions: {} as DashboardChartOptions,
      reportHTML: "",
      insight: null,
      insightLoading: false,
      insightError: null,
      insightGenerationStatus: "idle",
      activeInsightScope: {
        storeIds: ["S001"],
        startDate: "2026-08-01",
        endDate: "2026-08-07",
      },
      suggestions: [],
      onAskQuestion: () => undefined,
      onApplyInsightScope: () => true,
      onToggleInsightAction: async () => undefined,
      onViewChange: () => undefined,
    })
  );

  assert.match(html, />洞察与行动</);
  assert.doesNotMatch(html, />经营分析</);
});

test("insight panel keeps an old snapshot visible while generating", () => {
  const html = renderInsightPanel({ generationStatus: "generating" });

  assert.match(html, /正在更新洞察/);
  assert.match(html, new RegExp(insightDto.headline));
});

test("scope mismatch offers an explicit restore command", () => {
  const html = renderInsightPanel({
    activeScope: {
      storeIds: ["S002"],
      startDate: "2026-08-01",
      endDate: "2026-08-07",
    },
  });

  assert.match(html, /当前筛选范围与该洞察生成范围不一致/);
  assert.match(html, /切换至洞察范围/);
});

test("insight panel renders loading, empty and failed update states", () => {
  const loading = renderInsightPanel({ insight: null, isLoading: true });
  assert.match(loading, /正在加载最新洞察/);
  assert.match(loading, /role="status"/);

  const empty = renderInsightPanel({ insight: null, suggestions: ["问题一", "问题二", "问题三", "问题四"] });
  assert.match(empty, /尚无洞察/);
  assert.match(empty, /问题一/);
  assert.match(empty, /问题三/);
  assert.doesNotMatch(empty, /问题四/);

  const failed = renderInsightPanel({ generationStatus: "failed", error: "internal detail" });
  assert.match(failed, /本次洞察更新失败，聊天回答不受影响/);
  assert.doesNotMatch(failed, /internal detail/);
  assert.match(failed, new RegExp(insightDto.headline));
});

test("insight panel renders verification items and actionable priority states", () => {
  const html = renderInsightPanel();

  assert.match(html, /待核查项/);
  assert.match(html, /已观察事实/);
  assert.match(html, /可能原因/);
  assert.match(html, /需核查/);
  assert.match(html, />P0</);
  assert.match(html, />P1</);
  assert.match(html, />P2</);
  assert.match(html, /data-state="checked"/);
  assert.match(html, /负责角色：运营/);
  assert.match(html, /验证指标：销售额/);
});

test("action save failure keeps the snapshot visible with a light warning", () => {
  const html = renderInsightPanel({ error: "Insight action update failed" });

  assert.match(html, /行动状态保存失败/);
  assert.match(html, new RegExp(insightDto.headline));
  assert.doesNotMatch(html, /Insight action update failed/);
});

test("failed first generation renders a retryable empty state", () => {
  const html = renderInsightPanel({
    insight: null,
    generationStatus: "failed",
    error: "internal detail",
    suggestions: ["重新分析销售表现"],
  });

  assert.match(html, /本次洞察生成失败/);
  assert.match(html, /重新分析销售表现/);
  assert.doesNotMatch(html, /internal detail/);
});

const insightDto: InsightSnapshotDto = {
  id: "insight-1",
  sourceQuestion: "为什么本周销售额下降？",
  sourceIntent: "compare",
  scope: {
    storeIds: ["S001"],
    startDate: "2026-08-01",
    endDate: "2026-08-07",
    comparisonLabel: "环比上周",
  },
  headline: "销售下滑集中在晚间时段",
  findings: [
    {
      id: "finding-1",
      title: "晚间销售承压",
      summary: "晚间销售低于对照周期。",
      severity: "high",
      confidence: "high",
      subjectIds: ["S001"],
      metricCode: "sales",
      value: -12,
      unit: "percentage",
      displayValue: "-12%",
      evidenceIds: ["evidence-1"],
    },
  ],
  evidence: [
    {
      id: "evidence-1",
      type: "period_variance",
      title: "销售额周期对比",
      supportsFindingIds: ["finding-1"],
      unit: "currency",
      baselineLabel: "上周",
      series: [
        {
          key: "2026-08-01",
          label: "8月1日",
          value: 8800,
          baseline: 10000,
          direction: "negative",
        },
      ],
      interpretation: "8月1日销售额低于上周同期。",
    },
  ],
  verificationItems: [
    {
      id: "verification-1",
      observedFact: "晚间销售额下降",
      hypothesis: "排班不足可能影响转化",
      requiredCheck: "核对晚间排班与客流",
    },
  ],
  actions: [
    {
      id: "action-1",
      priority: "P0",
      title: "复核晚间排班",
      ownerRole: "运营",
      verificationMetricCode: "sales",
      verificationMetricLabel: "销售额",
      completed: true,
      completedAt: "2026-08-13T01:00:00.000Z",
    },
    {
      id: "action-2",
      priority: "P1",
      title: "检查活动执行",
      ownerRole: "店长",
      verificationMetricCode: "orders",
      verificationMetricLabel: "订单量",
      completed: false,
      completedAt: null,
    },
    {
      id: "action-3",
      priority: "P2",
      title: "观察次周表现",
      ownerRole: "数据分析",
      verificationMetricCode: "sales",
      verificationMetricLabel: "销售额",
      completed: false,
      completedAt: null,
    },
  ],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T01:00:00.000Z",
};

function renderInsightPanel(
  overrides: Partial<Parameters<typeof InsightActionPanel>[0]> = {}
) {
  return renderToStaticMarkup(
    createElement(InsightActionPanel, {
      insight: insightDto,
      isLoading: false,
      error: null,
      generationStatus: "idle",
      activeScope: {
        storeIds: ["S001"],
        startDate: "2026-08-01",
        endDate: "2026-08-07",
      },
      suggestions: [],
      onAskQuestion: () => undefined,
      onApplyScope: () => true,
      onToggleAction: async () => undefined,
      ...overrides,
    })
  );
}

function createClientContext(): WorkbenchContext {
  return {
    templateId: "regional_manager",
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate", "channel_mix"],
    availableIntents: ["achievement_rate", "channel_mix", "compare"],
    canAccessAdmin: false,
  };
}
