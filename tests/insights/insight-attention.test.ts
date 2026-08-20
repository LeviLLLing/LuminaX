import assert from "node:assert/strict";
import test from "node:test";
import {
  selectDiverseCandidates,
  type InsightAttentionCandidate,
} from "../../src/modules/insights/insight-attention-plan";

test("primary findings cover distinct subjects before support facts", () => {
  const selected = selectDiverseCandidates([
    candidate("metro-rate", "S004", "primary", 100),
    candidate("metro-gap", "S004", "support", 95),
    candidate("community-rate", "S005", "primary", 90),
    candidate("community-gap", "S005", "support", 85),
  ], { maxFindings: 3, minFindings: 1 });

  assert.deepEqual(selected.map((item) => item.sourceId), [
    "metro-rate",
    "community-rate",
    "metro-gap",
  ]);
});

test("healthy plans do not invent risk findings to reach three items", () => {
  const selected = selectDiverseCandidates([
    candidate("overall", "scope", "primary", 10, "positive"),
  ], { maxFindings: 5, minFindings: 1 });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].severity, "positive");
});

function candidate(
  sourceId: string,
  subjectKey: string,
  role: InsightAttentionCandidate["role"],
  score: number,
  severity: InsightAttentionCandidate["severity"] = "medium"
): InsightAttentionCandidate {
  return {
    sourceId,
    subjectKey,
    role,
    score,
    severity,
    confidence: "high",
    evidenceIds: [],
  };
}
