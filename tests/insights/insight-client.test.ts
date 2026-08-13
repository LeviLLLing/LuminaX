import assert from "node:assert/strict";
import test from "node:test";
import {
  InsightClientError,
  fetchLatestInsight,
  normalizeInsightSnapshotDto,
  updateLatestInsightAction,
} from "../../src/modules/insights/insight-client";
import { buildInsightEvidenceChartOption } from "../../src/modules/insights/insight-chart-options";
import type { InsightSnapshotDto } from "../../src/modules/insights/insight-types";
import { isInsightScopeActive } from "../../src/modules/workbench/workbench-presentation";

const insight: InsightSnapshotDto = {
  id: "i1",
  sourceQuestion: "Why did sales change?",
  sourceIntent: "compare",
  scope: { storeIds: ["S002", "S001"], startDate: "2026-08-01", endDate: "2026-08-07", comparisonLabel: null },
  headline: "Store variance",
  findings: [{ id: "f1", title: "Sales gap", summary: "One store is behind.", severity: "high", confidence: "high", subjectIds: ["S001"], metricCode: "sales", value: -12, unit: "%", displayValue: "-12%", evidenceIds: ["e1"] }],
  evidence: [{ id: "e1", type: "store_target_variance", title: "Store variance", supportsFindingIds: ["f1"], unit: "%", baselineLabel: "Target", series: [{ key: "S001", label: "Store One", value: -12, baseline: 0, direction: "negative" }, { key: "S002", label: "Store Two", value: 8, baseline: 0, direction: "positive" }], interpretation: "Store One is below target." }],
  verificationItems: [],
  actions: [{ id: "a1", priority: "P0", title: "Review execution", ownerRole: "运营", verificationMetricCode: "sales", verificationMetricLabel: "Sales", completed: false, completedAt: null }],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

test("latest insight client accepts null and validates a complete public DTO", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ insight: null }));
  assert.equal(await fetchLatestInsight(), null);
  context.mock.restoreAll();
  context.mock.method(globalThis, "fetch", async () => Response.json({ insight, ignored: true }));
  assert.deepEqual(await fetchLatestInsight(), insight);
});

test("latest insight client preserves permission errors", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "洞察权限已失效" }, { status: 403 })
  );
  await assert.rejects(
    fetchLatestInsight(),
    (error: unknown) => error instanceof InsightClientError && error.status === 403 && error.message === "洞察权限已失效"
  );
});

test("action client sends optimistic concurrency id and returns normalized DTO", async (context) => {
  let body: unknown;
  let url = "";
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return Response.json({ insight: { ...insight, actions: [{ ...insight.actions[0], completed: true, completedAt: "2026-08-13T01:00:00.000Z" }] } });
  });
  const updated = await updateLatestInsightAction({ insightId: "i1", actionId: "a1", completed: true });
  assert.equal(url, "/api/insights/latest/actions/a1");
  assert.deepEqual(body, { insightId: "i1", completed: true });
  assert.equal(updated.actions[0].completed, true);
});

test("DTO normalizer rejects malformed dates, numbers and cross references", () => {
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, createdAt: "today" }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, evidence: [{ ...insight.evidence[0], series: [{ ...insight.evidence[0].series[0], value: Number.NaN }] }] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, findings: [{ ...insight.findings[0], evidenceIds: ["missing"] }] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, evidence: [{ ...insight.evidence[0], supportsFindingIds: ["missing"] }] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, scope: { ...insight.scope, storeIds: ["S001", "S001"] } }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, actions: [{ ...insight.actions[0], completed: false, completedAt: "2026-08-13T01:00:00.000Z" }] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, actions: [insight.actions[0], insight.actions[0]] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, evidence: [{ ...insight.evidence[0], series: [insight.evidence[0].series[0], insight.evidence[0].series[0]] }] }), InsightClientError);
  const normalized = normalizeInsightSnapshotDto({ ...insight, userId: "ignored", sourceFingerprint: "ignored" });
  assert.equal("userId" in normalized, false);
  assert.equal("sourceFingerprint" in normalized, false);
});

test("insight scope comparison ignores store order but requires exact dates and stores", () => {
  assert.equal(isInsightScopeActive({ storeIds: ["S001", "S002"], startDate: "2026-08-01", endDate: "2026-08-07" }, insight.scope), true);
  assert.equal(isInsightScopeActive({ storeIds: ["S001"], startDate: "2026-08-01", endDate: "2026-08-07" }, insight.scope), false);
  assert.equal(isInsightScopeActive({ storeIds: ["S001", "S002"], startDate: "2026-08-02", endDate: "2026-08-07" }, insight.scope), false);
});

test("evidence chart options contain direct labels and a dashed baseline", () => {
  const option = buildInsightEvidenceChartOption(insight.evidence[0]) as {
    grid: { left: number; right: number };
    series: Array<{ label?: { show?: boolean; position?: string }; markLine?: { lineStyle?: { type?: string }; data?: Array<Record<string, number>> }; data?: Array<{ value: number }> }>;
  };
  assert.ok(option.grid.left >= 96);
  assert.ok(option.grid.right >= 56);
  assert.equal(option.series[0].label?.show, true);
  assert.equal(option.series[0].label?.position, "right");
  assert.equal(option.series[0].markLine?.lineStyle?.type, "dashed");
  assert.deepEqual(option.series[0].markLine?.data, [{ xAxis: 0 }]);
  assert.deepEqual(option.series[0].data?.map((item) => item.value), [-12, 8]);
});
