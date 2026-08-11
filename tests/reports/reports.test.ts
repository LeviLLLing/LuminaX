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
