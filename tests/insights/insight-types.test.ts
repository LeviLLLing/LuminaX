import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldGenerateInsight,
  TRIGGERING_INSIGHT_INTENTS,
} from "../../src/modules/insights/insight-trigger-policy";
import {
  toInsightSnapshotDto,
  type InsightSnapshot,
} from "../../src/modules/insights/insight-types";

test("only meaningful analysis intents trigger an insight", () => {
  assert.deepEqual(TRIGGERING_INSIGHT_INTENTS, [
    "order_trend",
    "aov_trend",
    "channel_mix",
    "daypart_analysis",
    "promotion_contribution",
    "refund_rate",
    "anomaly_detection",
    "compare",
    "attribution",
  ]);
  for (const intent of TRIGGERING_INSIGHT_INTENTS) {
    assert.equal(shouldGenerateInsight(intent), true);
  }
  for (const intent of [
    "achievement_rate",
    "custom_metric",
    "report",
    "irrelevant",
  ] as const) {
    assert.equal(shouldGenerateInsight(intent), false);
  }
});

test("public DTO removes server-only identity and permission fields", () => {
  const snapshot = createInsightSnapshotFixture();
  const dto = toInsightSnapshotDto(snapshot);
  assert.equal("userId" in dto, false);
  assert.equal("accessRequirements" in dto, false);
  assert.equal("sourceFingerprint" in dto, false);
  assert.equal(dto.id, snapshot.id);
  assert.equal(dto.findings[0].displayValue, "-12.4%");
});

function createInsightSnapshotFixture(): InsightSnapshot {
  return {
    id: "insight-1",
    userId: "user-1",
    sourceQuestion: "Why did sales decline?",
    sourceIntent: "order_trend",
    scope: {
      storeIds: ["S001"],
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      comparisonLabel: "previous period",
    },
    headline: "Orders declined",
    findings: [
      {
        id: "finding-1",
        title: "Order decline",
        summary: "Orders fell compared with the previous period.",
        severity: "high",
        confidence: "high",
        subjectIds: ["S001"],
        metricCode: "orders",
        value: -12.4,
        unit: "%",
        displayValue: "-12.4%",
        evidenceIds: ["evidence-1"],
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        type: "period_variance",
        title: "Period variance",
        supportsFindingIds: ["finding-1"],
        unit: "%",
        baselineLabel: "Previous period",
        series: [
          {
            key: "current",
            label: "Current",
            value: -12.4,
            baseline: 0,
            direction: "negative",
          },
        ],
        interpretation: "Orders were below baseline.",
      },
    ],
    verificationItems: [
      {
        id: "verification-1",
        observedFact: "Orders declined.",
        hypothesis: "A channel underperformed.",
        requiredCheck: "Check channel contribution.",
      },
    ],
    actions: [
      {
        id: "action-1",
        priority: "P1",
        title: "Review channel performance",
        ownerRole: "运营",
        verificationMetricCode: "orders",
        verificationMetricLabel: "Orders",
        completed: false,
        completedAt: null,
      },
    ],
    accessRequirements: [{ tableName: "sales", columns: ["orders"] }],
    sourceFingerprint: "fingerprint-1",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}
