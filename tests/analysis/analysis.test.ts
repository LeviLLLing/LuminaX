import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRegisteredAnalysis,
  listAnalysisDefinitions,
} from "../../src/modules/analysis/analysis-registry";
import { createAnalysisSnapshot } from "../../src/modules/analytics/analysis-snapshot";
import { JsonSalesDataSource } from "../../src/modules/data-source/json-sales-data-source";

const jsonDataSource = new JsonSalesDataSource();

test("analysis snapshot applies scope once and exposes consistent totals", async () => {
  const salesData = await jsonDataSource.loadSalesData();
  const snapshot = createAnalysisSnapshot(salesData, {
    storeIds: ["S001"],
    startDate: "2025-05-05",
    endDate: "2025-05-07",
  });

  assert.equal(snapshot.scope.storeIds.length, 1);
  assert.ok(snapshot.records.sales.length > 0);
  assert.ok(
    snapshot.records.sales.every(
      (item) =>
        item.store_id === "S001" &&
        item.date >= "2025-05-05" &&
        item.date <= "2025-05-07"
    )
  );
  assert.equal(
    snapshot.totals.sales,
    snapshot.records.sales.reduce(
      (total, item) => total + item.actual_sales,
      0
    )
  );
  assert.equal(snapshot.byStore.S001.totals.sales, snapshot.totals.sales);
});

test("analysis registry formats SQL metric results without calculating", () => {
  const data = {
    overall: {
      totalSales: 120,
      totalTarget: 100,
      gap: 20,
      achievementRate: 120,
    },
    stores: [
      {
        storeId: "S001",
        storeName: "上海商场店",
        totalSales: 120,
        totalTarget: 100,
        gap: 20,
        achievementRate: 120,
      },
    ],
  };
  const formatted = formatRegisteredAnalysis(
    "achievement_rate",
    data
  );

  assert.ok(listAnalysisDefinitions().length >= 10);
  assert.ok(formatted && formatted.length > 20);
});
