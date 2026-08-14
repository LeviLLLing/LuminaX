import assert from "node:assert/strict";
import test from "node:test";
import {
  InsightClientError,
  fetchLatestInsight,
  normalizeInsightSnapshotDto,
  updateLatestInsightAction,
} from "../../src/modules/insights/insight-client";
import {
  buildInsightEvidenceChartOption,
  formatInsightValue,
} from "../../src/modules/insights/insight-chart-options";
import type { InsightSnapshotDto } from "../../src/modules/insights/insight-types";
import { isInsightScopeActive } from "../../src/modules/workbench/workbench-presentation";
import {
  createLatestInsightStateController,
  type LatestInsightState,
} from "../../src/hooks/use-latest-insight";

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
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, findings: [{ ...insight.findings[0], evidenceIds: [] }] }), InsightClientError);
  assert.throws(() => normalizeInsightSnapshotDto({ ...insight, evidence: [{ ...insight.evidence[0], supportsFindingIds: [] }] }), InsightClientError);
  const normalized = normalizeInsightSnapshotDto({ ...insight, userId: "ignored", sourceFingerprint: "ignored" });
  assert.equal("userId" in normalized, false);
  assert.equal("sourceFingerprint" in normalized, false);
});

test("insight scope comparison ignores store order but requires exact dates and stores", () => {
  assert.equal(isInsightScopeActive({ storeIds: ["S001", "S002"], startDate: "2026-08-01", endDate: "2026-08-07" }, insight.scope), true);
  assert.equal(isInsightScopeActive({ storeIds: ["S001"], startDate: "2026-08-01", endDate: "2026-08-07" }, insight.scope), false);
  assert.equal(isInsightScopeActive({ storeIds: ["S001", "S002"], startDate: "2026-08-02", endDate: "2026-08-07" }, insight.scope), false);
});

test("evidence chart options format internal units as professional display values", () => {
  const formatted = (["percentage", "currency", "count", "ratio"] as const).map((unit) => {
    const option = buildInsightEvidenceChartOption({
      ...insight.evidence[0],
      unit,
      series: [{ ...insight.evidence[0].series[0], value: 12345.67, baseline: undefined }],
    }) as ChartOption;
    return callFormatter(option.series[0].label?.formatter, 12345.67);
  });
  assert.deepEqual(formatted, ["12,345.7%", "¥12,345.67", "12,346", "12,345.67"]);
  assert.ok(formatted.every((value) => !/percentage|currency|count|ratio/.test(value)));
});

test("currency formatting places the sign before the CNY symbol", () => {
  assert.equal(formatInsightValue(-12, "currency"), "-¥12.00");
  assert.equal(formatInsightValue(12345.67, "currency"), "¥12,345.67");
});

test("horizontal evidence aligns every heterogeneous baseline with its sorted category", () => {
  const option = buildInsightEvidenceChartOption({
    ...insight.evidence[0],
    unit: "currency",
    series: [
      { key: "small", label: "Small", value: 8, baseline: 9, direction: "positive" },
      { key: "large", label: "Large", value: -12, baseline: 15, direction: "negative" },
    ],
  }) as ChartOption;
  const categories = (option.yAxis as { data: string[] }).data;
  const baselines = option.series[1].data as Array<{ value: [number, string] }>;
  assert.deepEqual(categories, ["Large", "Small"]);
  assert.deepEqual(baselines.map((item) => item.value), [[15, "Large"], [9, "Small"]]);
  assert.deepEqual(baselines.map((item) => callFormatter(option.series[1].label?.formatter, item.value)), ["¥15.00", "¥9.00"]);
});

test("timeline evidence preserves every point baseline in deterministic key order", () => {
  const option = buildInsightEvidenceChartOption({
    ...insight.evidence[0],
    type: "period_variance",
    unit: "count",
    series: [
      { key: "2026-08-02", label: "08-02", value: 80, baseline: 90, direction: "negative" },
      { key: "2026-08-01", label: "08-01", value: 120, baseline: 100, direction: "positive" },
    ],
  }) as ChartOption;
  assert.deepEqual((option.xAxis as { data: string[] }).data, ["08-01", "08-02"]);
  assert.deepEqual(option.series[1].data, [100, 90]);
  assert.deepEqual([100, 90].map((value) => callFormatter(option.series[1].label?.formatter, value)), ["100", "90"]);
});

test("evidence chart options retain direct labels and reserved grid space", () => {
  const option = buildInsightEvidenceChartOption(insight.evidence[0]) as ChartOption & {
    grid: { left: number; right: number };
  };
  assert.ok(option.grid.left >= 96);
  assert.ok(option.grid.right >= 56);
  assert.equal(option.series[0].label?.show, true);
  assert.equal(option.series[0].label?.position, "right");
  assert.deepEqual((option.series[0].data as Array<{ value: number }>).map((item) => item.value), [-12, 8]);
});

test("latest insight state preserves stale content through generating and failed events", async () => {
  const states: LatestInsightState[] = [];
  const controller = createLatestInsightStateController({
    fetchLatest: async () => insight,
    updateAction: async () => insight,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  controller.subscribe((state) => states.push(state));
  await controller.reload();
  await controller.handleStreamEvent({ status: "generating" });
  assert.equal(controller.getState().insight?.id, "i1");
  assert.equal(controller.getState().generationStatus, "generating");
  await controller.handleStreamEvent({ status: "failed" });
  assert.equal(controller.getState().insight?.id, "i1");
  assert.equal(controller.getState().generationStatus, "failed");
  assert.match(controller.getState().error || "", /仍可继续使用/);
  assert.ok(states.length >= 3);
});

test("updated event clears generation state only after its matching snapshot refreshes", async () => {
  const updated = { ...insight, id: "i2", updatedAt: "2026-08-13T01:00:00.000Z" };
  let next: InsightSnapshotDto = insight;
  const controller = createLatestInsightStateController({
    fetchLatest: async () => next,
    updateAction: async () => next,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();
  await controller.handleStreamEvent({ status: "generating" });
  await controller.handleStreamEvent({ status: "updated", insightId: "i2", findingCount: 1, actionCount: 1 });
  assert.equal(controller.getState().generationStatus, "generating");
  next = updated;
  await controller.handleStreamEvent({ status: "updated", insightId: "i2", findingCount: 1, actionCount: 1 });
  assert.equal(controller.getState().insight?.id, "i2");
  assert.equal(controller.getState().generationStatus, "idle");
});

test("out-of-order reload completion cannot replace newer insight state", async () => {
  const pending: Array<(value: InsightSnapshotDto) => void> = [];
  const controller = createLatestInsightStateController({
    fetchLatest: () => new Promise((resolve) => pending.push(resolve)),
    updateAction: async () => insight,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  const oldReload = controller.reload();
  const newReload = controller.reload();
  pending[1]({ ...insight, id: "new" });
  await newReload;
  pending[0]({ ...insight, id: "old" });
  await oldReload;
  assert.equal(controller.getState().insight?.id, "new");
  assert.equal(controller.getState().isLoading, false);
});

test("stale matching reload cannot clear generation status after a newer snapshot wins", async () => {
  const pending: Array<(value: InsightSnapshotDto) => void> = [];
  const controller = createLatestInsightStateController({
    fetchLatest: () => new Promise((resolve) => pending.push(resolve)),
    updateAction: async () => insight,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.handleStreamEvent({ status: "generating" });
  const staleUpdated = controller.handleStreamEvent({
    status: "updated",
    insightId: "stale-match",
    findingCount: 1,
    actionCount: 1,
  });
  const newerReload = controller.reload();
  pending[1]({ ...insight, id: "newer" });
  await newerReload;
  pending[0]({ ...insight, id: "stale-match" });
  await staleUpdated;
  assert.equal(controller.getState().insight?.id, "newer");
  assert.equal(controller.getState().generationStatus, "generating");
});

test("new generating event invalidates an older updated reload", async () => {
  let resolveUpdated!: (value: InsightSnapshotDto) => void;
  let fetchCount = 0;
  const controller = createLatestInsightStateController({
    fetchLatest: async () => {
      fetchCount += 1;
      if (fetchCount === 1) return insight;
      return new Promise((resolve) => {
        resolveUpdated = resolve;
      });
    },
    updateAction: async () => insight,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();
  const olderUpdated = controller.handleStreamEvent({
    status: "updated",
    insightId: "i2",
    findingCount: 1,
    actionCount: 1,
  });
  await controller.handleStreamEvent({ status: "generating" });
  resolveUpdated({ ...insight, id: "i2" });
  await olderUpdated;
  assert.equal(controller.getState().insight?.id, "i1");
  assert.equal(controller.getState().generationStatus, "generating");
});

test("new failed event invalidates an older updated reload", async () => {
  let resolveUpdated!: (value: InsightSnapshotDto) => void;
  let fetchCount = 0;
  const controller = createLatestInsightStateController({
    fetchLatest: async () => {
      fetchCount += 1;
      if (fetchCount === 1) return insight;
      return new Promise((resolve) => {
        resolveUpdated = resolve;
      });
    },
    updateAction: async () => insight,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();
  const olderUpdated = controller.handleStreamEvent({
    status: "updated",
    insightId: "i2",
    findingCount: 1,
    actionCount: 1,
  });
  await controller.handleStreamEvent({ status: "failed" });
  resolveUpdated({ ...insight, id: "i2" });
  await olderUpdated;
  assert.equal(controller.getState().insight?.id, "i1");
  assert.equal(controller.getState().generationStatus, "failed");
  assert.match(controller.getState().error || "", /仍可继续使用/);
});

test("action update rolls back optimistically and performs exactly one reload on 409", async () => {
  let fetchCount = 0;
  const visible: boolean[] = [];
  const controller = createLatestInsightStateController({
    fetchLatest: async () => {
      fetchCount += 1;
      return insight;
    },
    updateAction: async () => {
      throw new InsightClientError(409, "stale");
    },
    now: () => "2026-08-13T01:00:00.000Z",
  });
  controller.subscribe((state) => visible.push(state.insight?.actions[0].completed ?? false));
  await controller.reload();
  fetchCount = 0;
  await controller.toggleAction("a1", true);
  assert.ok(visible.includes(true));
  assert.equal(controller.getState().insight?.actions[0].completed, false);
  assert.equal(fetchCount, 1);
});

test("authentication and permission failures clear a previously visible snapshot", async () => {
  for (const status of [401, 403]) {
    let authorized = true;
    const controller = createLatestInsightStateController({
      fetchLatest: async () => {
        if (!authorized) throw new InsightClientError(status, "洞察权限已失效");
        return insight;
      },
      updateAction: async () => insight,
      now: () => "2026-08-13T01:00:00.000Z",
    });

    await controller.reload();
    authorized = false;
    await assert.rejects(controller.reload(), InsightClientError);

    assert.equal(controller.getState().insight, null);
    assert.equal(controller.getState().error, "洞察权限已失效");
  }
});

test("same-action updates are ignored while the first save is pending", async () => {
  const pending: Array<ReturnType<typeof deferred<InsightSnapshotDto>>> = [];
  const sent: boolean[] = [];
  const controller = createLatestInsightStateController({
    fetchLatest: async () => insight,
    updateAction: (input) => {
      sent.push(input.completed);
      const request = deferred<InsightSnapshotDto>();
      pending.push(request);
      return request.promise;
    },
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();

  const markComplete = controller.toggleAction("a1", true);
  const markIncomplete = controller.toggleAction("a1", false);
  await Promise.resolve();
  assert.deepEqual(sent, [true]);

  assert.deepEqual(controller.getState().pendingActionIds, ["a1"]);
  pending[0].resolve(actionResponse(insight, "a1", true));
  await Promise.all([markComplete, markIncomplete]);

  assert.deepEqual(sent, [true]);
  assert.deepEqual(controller.getState().pendingActionIds, []);
  assert.equal(controller.getState().insight?.actions[0].completed, true);
});

test("action authorization failures immediately hide the protected snapshot", async () => {
  for (const status of [401, 403]) {
    const pending = deferred<InsightSnapshotDto>();
    const controller = createLatestInsightStateController({
      fetchLatest: async () => insight,
      updateAction: () => pending.promise,
      now: () => "2026-08-13T01:00:00.000Z",
    });
    await controller.reload();

    const update = controller.toggleAction("a1", true);
    assert.equal(controller.getState().insight?.actions[0].completed, true);
    pending.reject(new InsightClientError(status, "洞察权限已失效"));
    await update;

    assert.equal(controller.getState().insight, null);
    assert.equal(controller.getState().error, "洞察权限已失效");
  }
});

test("an older same-action authorization failure still hides its current snapshot", async () => {
  const first = deferred<InsightSnapshotDto>();
  const second = deferred<InsightSnapshotDto>();
  let updateCount = 0;
  const controller = createLatestInsightStateController({
    fetchLatest: async () => insight,
    updateAction: () => (updateCount++ === 0 ? first.promise : second.promise),
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();

  const olderUpdate = controller.toggleAction("a1", true);
  const newerUpdate = controller.toggleAction("a1", false);
  first.reject(new InsightClientError(403, "洞察权限已失效"));
  await olderUpdate;

  assert.equal(controller.getState().insight, null);
  assert.equal(controller.getState().error, "洞察权限已失效");
  second.resolve(insight);
  await newerUpdate;
  assert.equal(controller.getState().insight, null);
});

test("a newer SSE snapshot invalidates old action successes and failures", async () => {
  const first = deferred<InsightSnapshotDto>();
  const second = deferred<InsightSnapshotDto>();
  const nextInsight = {
    ...twoActionInsight(),
    id: "i2",
    headline: "New snapshot",
    updatedAt: "2026-08-13T02:00:00.000Z",
  };
  let fetchResult = twoActionInsight();
  let updateCount = 0;
  const controller = createLatestInsightStateController({
    fetchLatest: async () => fetchResult,
    updateAction: () => (updateCount++ === 0 ? first.promise : second.promise),
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();

  const oldSuccess = controller.toggleAction("a1", true);
  const oldFailure = controller.toggleAction("a2", true);
  fetchResult = nextInsight;
  await controller.handleStreamEvent({
    status: "updated",
    insightId: "i2",
    findingCount: 1,
    actionCount: 2,
  });

  first.resolve(actionResponse(twoActionInsight(), "a1", true));
  second.reject(new InsightClientError(403, "old permission failure"));
  await Promise.all([oldSuccess, oldFailure]);

  assert.equal(controller.getState().insight?.id, "i2");
  assert.equal(controller.getState().insight?.headline, "New snapshot");
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().generationStatus, "idle");
});

test("a newer reload snapshot invalidates an old action authorization failure", async () => {
  const action = deferred<InsightSnapshotDto>();
  const nextInsight = {
    ...twoActionInsight(),
    headline: "Reloaded snapshot",
    updatedAt: "2026-08-13T02:00:00.000Z",
  };
  let fetchResult = twoActionInsight();
  const controller = createLatestInsightStateController({
    fetchLatest: async () => fetchResult,
    updateAction: () => action.promise,
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();

  const oldUpdate = controller.toggleAction("a1", true);
  fetchResult = nextInsight;
  await controller.reload();
  action.reject(new InsightClientError(401, "old session failure"));
  await oldUpdate;

  assert.equal(controller.getState().insight?.id, "i1");
  assert.equal(controller.getState().insight?.headline, "Reloaded snapshot");
  assert.equal(controller.getState().error, null);
});

test("out-of-order action snapshots merge only their acknowledged fields", async () => {
  const first = deferred<InsightSnapshotDto>();
  const second = deferred<InsightSnapshotDto>();
  let updateCount = 0;
  const initial = twoActionInsight();
  const controller = createLatestInsightStateController({
    fetchLatest: async () => initial,
    updateAction: () => (updateCount++ === 0 ? first.promise : second.promise),
    now: () => "2026-08-13T01:00:00.000Z",
  });
  await controller.reload();

  const updateFirst = controller.toggleAction("a1", true);
  const updateSecond = controller.toggleAction("a2", true);
  second.resolve(actionResponse(initial, "a2", true));
  await updateSecond;
  first.resolve(actionResponse(initial, "a1", true));
  await updateFirst;

  assert.deepEqual(
    controller.getState().insight?.actions.map((action) => [action.id, action.completed]),
    [["a1", true], ["a2", true]]
  );
});

interface ChartOption {
  xAxis?: unknown;
  yAxis?: unknown;
  series: Array<{
    data?: unknown;
    label?: { show?: boolean; position?: string; formatter?: unknown };
  }>;
}

function callFormatter(formatter: unknown, value: number | [number, string]): string {
  assert.equal(typeof formatter, "function");
  return (formatter as (params: { value: number | [number, string] }) => string)({ value });
}

function twoActionInsight(): InsightSnapshotDto {
  return {
    ...structuredClone(insight),
    actions: [
      structuredClone(insight.actions[0]),
      {
        id: "a2",
        priority: "P1",
        title: "Check staffing",
        ownerRole: "店长",
        verificationMetricCode: "orders",
        verificationMetricLabel: "Orders",
        completed: false,
        completedAt: null,
      },
    ],
  };
}

function actionResponse(
  snapshot: InsightSnapshotDto,
  actionId: string,
  completed: boolean
): InsightSnapshotDto {
  return {
    ...structuredClone(snapshot),
    actions: snapshot.actions.map((action) =>
      action.id === actionId
        ? {
            ...action,
            completed,
            completedAt: completed ? "2026-08-13T01:00:00.000Z" : null,
          }
        : structuredClone(action)
    ),
    updatedAt: "2026-08-13T01:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
