import assert from "node:assert/strict";
import test from "node:test";
import { JsonSalesDataSource } from "../../src/modules/data-source/json-sales-data-source";
import { generateWeeklyReportHTML } from "../../src/modules/reports/report-engine";

const jsonDataSource = new JsonSalesDataSource();

test("report renderers consume the stable weekly report model", async () => {
  const salesData = await jsonDataSource.loadSalesData();
  const html = generateWeeklyReportHTML(
    salesData,
    "2025-05-05",
    "2025-05-07"
  );

  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /salesTrend/);
  assert.match(html, /echarts/);
});

test("weekly report limits every aggregate to the requested store scope", async () => {
  const salesData = await jsonDataSource.loadSalesData();
  const includedStore = salesData.store_master[0];
  const excludedStore = salesData.store_master[1];
  const html = generateWeeklyReportHTML(
    salesData,
    "2025-05-05",
    "2025-05-07",
    [includedStore.store_id]
  );

  assert.equal(html.includes(includedStore.store_name), true);
  assert.equal(html.includes(excludedStore.store_name), false);
});
