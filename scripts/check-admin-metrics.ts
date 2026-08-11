import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import { readDatabaseConfig } from "../src/modules/data-source/data-source-factory";
import { MySqlMetricQueryRunner } from "../src/modules/admin/metrics/metric-query-runner";
import { validateMetricSqlTemplate } from "../src/modules/admin/metrics/metric-sql-template";

loadEnvironment({ path: ".env.local", quiet: true });

const sqlTemplate = `
SELECT ROUND(SUM(actual_sales), 2) AS metric_value
FROM store_sales_daily
WHERE store_id IN ({{store_ids}})
  AND date BETWEEN {{start_date}} AND {{end_date}}
`.trim();

async function main(): Promise<void> {
  const runner = new MySqlMetricQueryRunner(readDatabaseConfig("MYSQL"));
  try {
    const validation = validateMetricSqlTemplate(sqlTemplate);
    assert.equal(validation.valid, true);
    const result = await runner.run(sqlTemplate, {
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-14",
    });
    assert.equal(result.rowCount, 1);
    assert.equal(result.rows[0].metric_value, 772076);
    console.log("Admin metric SQL: store_sales_daily execution OK");
  } finally {
    await runner.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Admin metric SQL check failed."
  );
  process.exitCode = 1;
});
