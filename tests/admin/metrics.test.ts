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
import { RegisteredCustomMetricRuntime } from "../../src/modules/admin/metrics/custom-metric-runtime";
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

test("old custom metrics load with a neutral insight policy", async () => {
  const repository = new InMemoryMetricRepository();
  const metric = createPublishedMetric();
  delete (metric as Partial<typeof metric>).insightPolicy;

  await repository.save(metric);

  assert.equal((await repository.findById(metric.id))?.insightPolicy ?? null, null);
});

test("metric publication rejects invalid policy thresholds", async () => {
  const repository = new InMemoryMetricRepository();
  const application = createMetricAdminApplication(
    repository,
    {
      async run() {
        return { rows: [{ metric_value: 1 }], rowCount: 1, columns: ["metric_value"] };
      },
    },
    {
      async generate() {
        return { sqlTemplate: SAFE_CUSTOM_METRIC_SQL, explanation: "", assumptions: [] };
      },
    }
  );

  await assert.rejects(
    application.saveDraft({
      code: "custom_sales_total",
      name: "自定义销售额",
      description: "统计范围内实际销售额合计",
      aliases: ["销售总额"],
      category: "sales",
      unit: "currency",
      precision: 2,
      requestedTables: ["store_sales_daily"],
      sqlTemplate: SAFE_CUSTOM_METRIC_SQL,
      insightPolicy: {
        direction: "lower_is_better",
        benchmark: "absolute",
        warningThreshold: 3,
        criticalThreshold: 2,
        targetValue: null,
      },
    }),
    /严重阈值/
  );
});

test("custom metric policy survives SQL changes and reaches runtime metadata", async () => {
  const repository = new InMemoryMetricRepository();
  const metric = createPublishedMetric();
  metric.insightPolicy = {
    direction: "lower_is_better",
    benchmark: "absolute",
    warningThreshold: 2,
    criticalThreshold: 3,
    targetValue: null,
  };
  await repository.save(metric);
  const application = createMetricAdminApplication(
    repository,
    { async run() { return { rows: [], rowCount: 0, columns: [] }; } },
    { async generate() { return { sqlTemplate: "", explanation: "", assumptions: [] }; } }
  );

  const saved = await application.saveDraft({
    ...metric,
    sqlTemplate: `${metric.sqlTemplate}\n-- changed`,
  });
  const runtime = new RegisteredCustomMetricRuntime(repository, {
    async run() {
      return { rows: [{ metric_value: 4 }], rowCount: 1, columns: ["metric_value"] };
    },
  });
  await repository.save({ ...saved, status: "published" });
  const execution = await runtime.execute(metric.id, {
    storeIds: ["S001"],
    startDate: "2025-05-01",
    endDate: "2025-05-14",
  });

  assert.deepEqual(saved.insightPolicy, metric.insightPolicy);
  assert.deepEqual(execution.metric.insightPolicy, metric.insightPolicy);
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

test("custom metric matching returns the unique highest-score match", async () => {
  const repository = new InMemoryMetricRepository();
  const metric = {
    ...createPublishedMetric(),
    aliases: ["销售总额"],
  };
  await repository.save(metric);
  const runtime = new RegisteredCustomMetricRuntime(repository, {
    async run() {
      return { rows: [], rowCount: 0, columns: [] };
    },
  });

  const result = await runtime.match("分析自定义销售额");

  assert.equal(result.status, "matched");
  assert.equal(result.metric?.id, metric.id);
});

test("custom metric matching refuses equal-score ambiguity", async () => {
  const repository = new InMemoryMetricRepository();
  await repository.save({
    ...createPublishedMetric(),
    id: "metric-a",
    code: "repurchase_rate",
    name: "复购率",
    aliases: ["会员复购"],
  });
  await repository.save({
    ...createPublishedMetric(),
    id: "metric-b",
    code: "member_rate",
    name: "会员率",
    aliases: ["会员复购"],
  });
  const runtime = new RegisteredCustomMetricRuntime(repository, {
    async run() {
      return { rows: [], rowCount: 0, columns: [] };
    },
  });

  assert.equal((await runtime.match("分析会员复购")).status, "ambiguous");
});
