import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessAnalysisContext } from "../../src/modules/agents/business/business-agent";
import { InsightGenerationGuard } from "../../src/modules/insights/insight-generation-guard";
import {
  StaleInsightGenerationError,
  buildInsightReceipt,
  createInsightApplication,
} from "../../src/modules/insights/insight-application";
import type { InsightComposer } from "../../src/modules/insights/insight-composer";
import type { InsightSourceCatalog } from "../../src/modules/insights/insight-source-catalog";
import type { InsightSnapshot } from "../../src/modules/insights/insight-types";
import type { LatestInsightRepository } from "../../src/modules/insights/latest-insight-repository";

const analysis: BusinessAnalysisContext = {
  question: "对比门店表现",
  intent: "compare",
  analysisData: {
    stores: [
      { storeId: "S001", storeName: "一店", totalSales: 90, totalTarget: 100, achievementRate: 90, totalOrders: 9, avgOrderValue: 10, totalRefund: 1, refundRate: 1 },
      { storeId: "S002", storeName: "二店", totalSales: 120, totalTarget: 100, achievementRate: 120, totalOrders: 10, avgOrderValue: 12, totalRefund: 2, refundRate: 2 },
    ],
  },
  attributionNarrative: null,
  fallbackContent: "完整分析正文",
  storeIds: ["S001", "S002"],
  startDate: "2025-05-01",
  endDate: "2025-05-14",
  accessRequirements: [{ tableName: "store_master", columns: ["store_id"] }],
};

test("successful generation saves before returning and produces a short receipt", async () => {
  const order: string[] = [];
  const repository = createRepository(order);
  const application = createInsightApplication({
    repository,
    guard: new InsightGenerationGuard(),
    composer: createComposer(order),
    buildCatalog: () => catalog,
    authorizeSnapshot: async () => {
      order.push("authorized");
    },
  });

  const snapshot = await application.generateForAnalysis(
    application.beginRequest("u1", "request-1", 1),
    analysis
  );

  assert.deepEqual(order, ["compose", "save"]);
  assert.equal(snapshot.userId, "u1");
  const receipt = buildInsightReceipt(snapshot);
  assert.match(receipt, /3 项发现/);
  assert.match(receipt, /2 项行动/);
  assert.doesNotMatch(receipt, /门店差异值得跟进/);
});

test("older concurrent analysis cannot overwrite the newer request", async () => {
  const repository = createRepository([]);
  const application = createInsightApplication({
    repository,
    guard: new InsightGenerationGuard(),
    composer: createComposer([]),
    buildCatalog: () => catalog,
  });
  const oldToken = application.beginRequest("u1", "old", 10);
  const newToken = application.beginRequest("u1", "new", 20);

  await application.generateForAnalysis(newToken, analysis);
  await assert.rejects(
    application.generateForAnalysis(oldToken, analysis),
    StaleInsightGenerationError
  );
  assert.equal((await repository.findByUserId("u1"))?.sourceQuestion, analysis.question);
});

test("an older generation that finishes composing last cannot write", async () => {
  const repository = createRepository([]);
  let releaseOld: (() => void) | undefined;
  let oldComposeStarted: (() => void) | undefined;
  const oldStarted = new Promise<void>((resolve) => {
    oldComposeStarted = resolve;
  });
  const oldRelease = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const composer = createComposer([]);
  const application = createInsightApplication({
    repository,
    guard: new InsightGenerationGuard(),
    composer: {
      async compose(input) {
        if (input.question === "old") {
          oldComposeStarted?.();
          await oldRelease;
        }
        return composer.compose(input);
      },
    },
    buildCatalog: () => catalog,
  });
  const oldAnalysis = { ...analysis, question: "old" };
  const newAnalysis = { ...analysis, question: "new" };

  const oldGeneration = application.generateForAnalysis(
    application.beginRequest("u1", "old", 10),
    oldAnalysis
  );
  await oldStarted;
  await application.generateForAnalysis(
    application.beginRequest("u1", "new", 20),
    newAnalysis
  );
  releaseOld?.();

  await assert.rejects(oldGeneration, StaleInsightGenerationError);
  assert.equal((await repository.findByUserId("u1"))?.sourceQuestion, "new");
});

test("beginRequest does not claim the generation guard", async () => {
  const guard = new InsightGenerationGuard();
  const application = createInsightApplication({
    repository: createRepository([]),
    guard,
    composer: createComposer([]),
    buildCatalog: () => catalog,
  });
  const inFlight = application.beginRequest("u1", "in-flight", 10);
  assert.equal(guard.claim(inFlight), true);
  application.beginRequest("u1", "not-generated", 20);
  assert.equal(guard.isCurrent(inFlight), true);
});

const catalog: InsightSourceCatalog = {
  findingSources: [1, 2, 3].map((value) => ({
    id: `source-${value}`,
    metricCode: "sales",
    label: `来源${value}`,
    value,
    unit: "count",
    displayValue: String(value),
    subjectIds: ["S001"],
    evidenceCandidateIds: [`evidence-${value}`],
  })),
  evidenceCandidates: [1, 2, 3].map((value) => ({
    id: `evidence-${value}`,
    type: "metric_drivers" as const,
    title: `证据${value}`,
    unit: "count",
    baselineLabel: "数量",
    series: [{ key: `k-${value}`, label: `来源${value}`, value, direction: "positive" as const }],
    interpretationFacts: [`来源${value}为${value}`],
  })),
  verificationMetricLabels: { sales: "销售额" },
};

function createComposer(order: string[]): InsightComposer {
  return {
    async compose() {
      order.push("compose");
      return {
        headline: "门店差异值得跟进",
        findings: [1, 2, 3].map((value) => ({ sourceId: `source-${value}`, title: `发现甲${value === 1 ? "" : value === 2 ? "乙" : "丙"}`, summary: "需要持续观察", severity: "medium" as const, confidence: "high" as const, evidenceIds: [`evidence-${value}`] })),
        verificationItems: [],
        actions: [
          { priority: "P0", title: "核查门店目标执行", ownerRole: "区域经理", verificationMetricCode: "sales" },
          { priority: "P1", title: "复盘运营动作", ownerRole: "运营", verificationMetricCode: "sales" },
        ],
      };
    },
  };
}

function createRepository(order: string[]): LatestInsightRepository {
  let current: InsightSnapshot | null = null;
  return {
    async findByUserId() { return current && structuredClone(current); },
    async replaceForUser(snapshot) { order.push("save"); current = structuredClone(snapshot); return structuredClone(snapshot); },
    async updateActionState() { if (!current) throw new Error("missing"); return structuredClone(current); },
  };
}
