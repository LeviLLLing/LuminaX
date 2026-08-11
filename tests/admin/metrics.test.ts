import assert from "node:assert/strict";
import test from "node:test";
import {
  createMetricSqlAuthoringAgent,
  type MetricSqlAuthoringAgent,
} from "../../src/modules/agents/metric-authoring/metric-sql-authoring-agent";
import { createMetricAdminApplication } from "../../src/modules/admin/metrics/metric-admin-application";
import type { MetricDefinitionInput } from "../../src/modules/admin/metrics/metric-definition";
import type { MetricQueryRunner } from "../../src/modules/admin/metrics/metric-query-runner";
import {
  compileMetricSqlTemplate,
  validateMetricSqlTemplate,
} from "../../src/modules/admin/metrics/metric-sql-template";
import { getCustomMetricAccessRequirements } from "../../src/modules/admin/permissions/metric-access-requirements";
import { FakeAgentModel } from "../fixtures/fake-agent-model";
import { createPublishedMetric, SAFE_CUSTOM_METRIC_SQL } from "../fixtures/metrics";
import { InMemoryMetricRepository } from "../fixtures/repositories";

test("metric SQL authoring retries once after a transient model timeout", async () => {
  let attempts = 0;
  const model = new FakeAgentModel("metric-authoring-model", () => {
    attempts += 1;
    if (attempts === 1) return null;
    return JSON.stringify({
      sqlTemplate: SAFE_CUSTOM_METRIC_SQL,
      explanation: "销售额求和",
      assumptions: [],
    });
  });
  const agent = createMetricSqlAuthoringAgent(model);

  const generated = await agent.generate({
    code: "custom_sales_total",
    name: "自定义销售额",
    description: "统计范围内实际销售额合计",
    aliases: [],
    category: "sales",
    unit: "currency",
    precision: 2,
    requestedTables: ["store_sales_daily"],
    sqlTemplate: "",
  });

  assert.equal(attempts, 2);
  assert.equal(generated.sqlTemplate, SAFE_CUSTOM_METRIC_SQL);
});

test("custom metric SQL validator enforces read-only scoped queries", () => {
  const validation = validateMetricSqlTemplate(SAFE_CUSTOM_METRIC_SQL);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.tables, ["store_sales_daily"]);
  assert.deepEqual(validation.outputColumns, ["metric_value"]);

  const compiled = compileMetricSqlTemplate(SAFE_CUSTOM_METRIC_SQL, {
    storeIds: ["S001", "S002"],
    startDate: "2025-05-01",
    endDate: "2025-05-14",
  });
  assert.match(compiled.sql, /LIMIT 200$/);
  assert.deepEqual(compiled.values, [
    "KFC001",
    "KFC002",
    "2025-05-01",
    "2025-05-14",
  ]);

  const cteValidation = validateMetricSqlTemplate(`
WITH agg AS (
  SELECT SUM(actual_sales) AS sales
  FROM store_sales_daily
  WHERE store_id IN ({{store_ids}})
    AND date BETWEEN {{start_date}} AND {{end_date}}
)
SELECT sales AS metric_value FROM agg
  `);
  assert.equal(cteValidation.valid, true);
  assert.deepEqual(cteValidation.tables, ["store_sales_daily"]);

  const writeAttempt = validateMetricSqlTemplate(`
DELETE FROM store_sales_daily
WHERE store_id IN ({{store_ids}})
  AND date BETWEEN {{start_date}} AND {{end_date}}
  `);
  assert.equal(writeAttempt.valid, false);

  const unauthorizedRead = validateMetricSqlTemplate(`
SELECT COUNT(*) AS metric_value
FROM mysql.user
WHERE User IN ({{store_ids}})
  AND CURRENT_DATE BETWEEN {{start_date}} AND {{end_date}}
  `);
  assert.equal(unauthorizedRead.valid, false);
  assert.match(unauthorizedRead.errors.join(" "), /未授权数据表/);
});

test("metric admin application publishes only after validation and test", async () => {
  const repository = new InMemoryMetricRepository();
  const queryRunner: MetricQueryRunner = {
    async run() {
      return {
        rows: [{ metric_value: 3238408 }],
        rowCount: 1,
        columns: ["metric_value"],
      };
    },
  };
  const authoringAgent: MetricSqlAuthoringAgent = {
    async generate() {
      return {
        sqlTemplate: SAFE_CUSTOM_METRIC_SQL,
        explanation: "销售额求和",
        assumptions: [],
      };
    },
  };
  const application = createMetricAdminApplication(
    repository,
    queryRunner,
    authoringAgent,
    () => new Date("2026-08-10T08:00:00.000Z")
  );
  const input: MetricDefinitionInput = {
    code: "custom_sales_total",
    name: "自定义销售额",
    description: "统计范围内实际销售额合计",
    aliases: ["销售总额"],
    category: "sales",
    unit: "currency",
    precision: 2,
    requestedTables: ["store_sales_daily"],
    sqlTemplate: "",
  };

  const generated = await application.generateSql(input);
  assert.equal(generated.validation.valid, true);
  const draft = await application.saveDraft({
    ...input,
    sqlTemplate: generated.sqlTemplate,
  });
  assert.equal(draft.status, "draft");

  const published = await application.publish(
    { ...draft },
    {
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-14",
    }
  );
  assert.equal(published.metric.status, "published");
  assert.equal(published.metric.validation?.sampleRowCount, 1);
  assert.equal((await application.list()).length, 12);

  const disabled = await application.disable(published.metric.id);
  assert.equal(disabled.status, "disabled");
});

test("custom metric permissions are derived from SQL source columns", () => {
  const requirements = getCustomMetricAccessRequirements(
    createPublishedMetric()
  );
  assert.deepEqual(requirements, [
    {
      tableName: "store_sales_daily",
      columns: ["actual_sales", "store_id", "date"],
    },
  ]);
});
