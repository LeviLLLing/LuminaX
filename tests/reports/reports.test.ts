import assert from "node:assert/strict";
import test from "node:test";
import { JsonSalesDataSource } from "../../src/modules/data-source/json-sales-data-source";
import { FakeAgentModel } from "../fixtures/fake-agent-model";
import { buildWeeklyReportData } from "../../src/modules/reports/report-data-builder";
import { generateWeeklyReportHTML } from "../../src/modules/reports/report-engine";
import { escapeReportHtml } from "../../src/modules/reports/report-html-escape";
import { generateReportInsights } from "../../src/modules/reports/report-insight-generator";

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

test("report insight generator uses one structured model request", async () => {
  const salesData = await jsonDataSource.loadSalesData();
  const reportData = buildWeeklyReportData(
    salesData,
    "2025-05-01",
    "2025-05-14"
  );
  const model = new FakeAgentModel("report-model", () =>
    JSON.stringify({
      trendSummary: ["趋势1", "趋势2", "趋势3", "趋势4", "趋势5", "趋势6"],
      attentionItems: [
        ...Array.from({ length: 5 }, (_, index) => ({
          severity: index === 0 ? "high" : "medium",
          title: `事项${index + 1}`,
          evidence: `依据${index + 1}`,
          action: `行动${index + 1}`,
        })),
        {
          severity: "high",
          title: "超出数量",
          evidence: "不应保留",
          action: "不应保留",
        },
      ],
    })
  );

  const result = await generateReportInsights(reportData, model);

  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].temperature, 0.2);
  assert.equal(result.source, "ai");
  assert.equal(result.trendSummary.length, 6);
  assert.equal(result.attentionItems.length, 5);
  for (const key of [
    "totalSales",
    "salesTrend",
    "storeRanking",
    "channelBreakdown",
    "categoryBreakdown",
    "daypartBreakdown",
    "refundRate",
    "anomalies",
  ]) {
    assert.match(model.requests[0].messages[0].content, new RegExp(key));
  }
});

test("report insight generator silently falls back on invalid model output", async () => {
  const salesData = await jsonDataSource.loadSalesData();
  const reportData = buildWeeklyReportData(
    salesData,
    "2025-05-01",
    "2025-05-14"
  );
  const model = new FakeAgentModel("report-model", () => "not-json");

  const result = await generateReportInsights(reportData, model);

  assert.equal(result.source, "fallback");
  assert.ok(result.trendSummary.length > 0);
  assert.ok(result.attentionItems.length > 0);
});

test("report HTML escaping treats model content as plain text", () => {
  const escaped = escapeReportHtml('<img src=x onerror=alert(1)> & "x"');

  assert.equal(escaped.includes("<img"), false);
  assert.equal(
    escaped,
    "&lt;img src=x onerror=alert(1)&gt; &amp; &quot;x&quot;"
  );
});
