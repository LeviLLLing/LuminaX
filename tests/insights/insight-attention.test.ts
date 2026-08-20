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

test("equal-score candidates are ordered by source ID", () => {
  const selected = selectDiverseCandidates([
    candidate("zeta", "S003", "primary", 10),
    candidate("alpha", "S001", "primary", 10),
    candidate("beta", "S002", "primary", 10),
  ], { maxFindings: 3, minFindings: 0 });

  assert.deepEqual(selected.map((item) => item.sourceId), [
    "alpha",
    "beta",
    "zeta",
  ]);
});

for (const scenario of [
  { name: "floors a fractional maximum", maxFindings: 1.5, expected: ["first"] },
  { name: "returns no candidates for a zero maximum", maxFindings: 0, expected: [] },
  { name: "returns no candidates for a negative maximum", maxFindings: -1, expected: [] },
  { name: "returns no candidates for NaN maximum", maxFindings: Number.NaN, expected: [] },
  { name: "returns no candidates for an infinite maximum", maxFindings: Infinity, expected: [] },
  { name: "returns no candidates for a negative infinite maximum", maxFindings: -Infinity, expected: [] },
]) {
  test(`quota normalization ${scenario.name}`, () => {
    const selected = selectDiverseCandidates([
      candidate("first", "S001", "primary", 10),
      candidate("second", "S002", "primary", 9),
    ], { maxFindings: scenario.maxFindings, minFindings: 0 });

    assert.deepEqual(selected.map((item) => item.sourceId), scenario.expected);
  });
}

test("minimum quota does not pad candidates when it is non-finite", () => {
  const selected = selectDiverseCandidates([
    candidate("only", "scope", "primary", 10, "positive"),
  ], { maxFindings: 5, minFindings: Infinity });

  assert.deepEqual(selected.map((item) => item.sourceId), ["only"]);
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
