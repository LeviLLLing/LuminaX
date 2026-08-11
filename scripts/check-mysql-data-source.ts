import { config as loadEnvironment } from "dotenv";
import assert from "node:assert/strict";
import { MySqlSalesDataSource } from "../src/modules/data-source/mysql-sales-data-source";
import type { SalesData } from "../src/modules/domain/sales-data";

loadEnvironment({ path: ".env.local", quiet: true });

const TABLES: ReadonlyArray<keyof SalesData> = [
  "store_master",
  "store_sales_daily",
  "sales_target_daily",
  "sales_by_channel",
  "sales_by_daypart",
  "sales_by_category",
  "promotion_daily",
  "refund_cancel_daily",
  "store_manager_feedback",
  "store_sales_attribution_dataset",
];

async function main(): Promise<void> {
  const dataSource = new MySqlSalesDataSource({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || "luminax",
    username: process.env.MYSQL_USERNAME || "",
    password: process.env.MYSQL_PASSWORD || "",
  });

  try {
    const data = await dataSource.loadSalesData();
    for (const table of TABLES) {
      const rowCount = data[table].length;
      if (rowCount === 0) {
        throw new Error(`MySQL table ${table} contains no rows.`);
      }
      console.log(`${table}: ${rowCount} rows`);
    }
    assert.ok(
      data.store_master.every((store) => /^S\d{3}$/.test(store.store_id)),
      "Store IDs must be normalized to the external Sxxx format."
    );
    assert.ok(
      data.store_sales_daily.every((row) => /^S\d{3}$/.test(row.store_id)),
      "Daily sales must retain a valid normalized store ID."
    );
    console.log("LuminaX MySQL data source is ready.");
  } finally {
    await dataSource.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "MySQL check failed.");
  process.exitCode = 1;
});
