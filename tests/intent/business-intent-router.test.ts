import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntent } from "../../src/modules/intent/intent-classifier";

test("broad all-store sales questions fall back to compare", () => {
  assert.equal(
    classifyIntent("分析5月1日至5月7日所有门店的销售情况").intent,
    "compare"
  );
  assert.equal(
    classifyIntent("看看经营表现", { scopeHint: "multi_store" }).intent,
    "compare"
  );
});

test("single-store target questions remain achievement analysis", () => {
  assert.equal(
    classifyIntent("上海商场店销售目标完成得怎么样", {
      scopeHint: "single_store",
    }).intent,
    "achievement_rate"
  );
});

test("explicit attribution intent overrides the broad sales fallback", () => {
  assert.equal(
    classifyIntent("分析所有门店的销售情况为什么有差异").intent,
    "attribution"
  );
});

test("business intent preserves parsed dates and store ids", () => {
  const result = classifyIntent(
    "分析2025年5月1日至2025年5月7日上海商场店的销售情况"
  );

  assert.equal(result.startDate, "2025-05-01");
  assert.equal(result.endDate, "2025-05-07");
  assert.deepEqual(result.storeIds, ["S001"]);
});
