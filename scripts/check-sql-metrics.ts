import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import { formatLocalAnalysis } from "../src/modules/chat/local-answer-formatter";
import { readDatabaseConfig } from "../src/modules/data-source/data-source-factory";
import { MySqlSalesDataSource } from "../src/modules/data-source/mysql-sales-data-source";
import {
  computeAchievementRate,
  computeAOVTrend,
  computeChannelMix,
  computeDaypartAnalysis,
  computeOrderTrend,
  computePromotionContribution,
  computeRefundRate,
} from "../src/modules/metrics/metric-engine";
import * as metricQueries from "../src/modules/metrics/sql/mysql-metric-queries";
import { MySqlSqlMetricQueryExecutor } from "../src/modules/metrics/sql/mysql-sql-metric-query-executor";
import type { SqlMetricIntent } from "../src/modules/metrics/sql-metric-query-executor";

loadEnvironment({ path: ".env.local", quiet: true });

const INTENTS: SqlMetricIntent[] = [
  "achievement_rate",
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "promotion_contribution",
  "refund_rate",
  "anomaly_detection",
  "compare",
  "attribution",
  "report",
];

async function main(): Promise<void> {
  verifyDailySalesFactSource();

  const executor = new MySqlSqlMetricQueryExecutor(
    readDatabaseConfig("MYSQL")
  );
  const legacyDataSource = new MySqlSalesDataSource(
    readDatabaseConfig("MYSQL")
  );
  const scope = {
    storeIds: ["S001", "S002"],
    startDate: "2025-05-01",
    endDate: "2025-05-14",
  };

  try {
    const storeIds = await executor.listStoreIds();
    assert.deepEqual(storeIds, ["S001", "S002", "S003", "S004", "S005"]);

    for (const intent of INTENTS) {
      const execution = await executor.execute(intent, scope);
      assert.equal(execution.source, "sql");
      assert.ok(execution.data, `${intent} returned no data`);
      const formatted = formatLocalAnalysis(intent, execution.data);
      assert.ok(formatted.length > 20, `${intent} could not be formatted`);
      console.log(`${intent}: SQL OK`);
    }

    const first = await executor.execute("achievement_rate", scope);
    const second = await executor.execute("achievement_rate", scope);
    assert.deepEqual(second.data, first.data);
    console.log("achievement_rate: deterministic result OK");

    const salesData = await legacyDataSource.loadSalesData();
    await verifyLegacyParity(executor, scope, salesData);
    console.log("SQL metrics: legacy result parity OK");
  } finally {
    await executor.close();
    await legacyDataSource.close();
  }
}

function verifyDailySalesFactSource(): void {
  const registeredSql = Object.values(metricQueries);
  assert.ok(
    registeredSql.some((sql) => sql.includes("store_sales_daily")),
    "Fixed metric SQL must use store_sales_daily as its daily sales fact source."
  );
  assert.ok(
    registeredSql.every(
      (sql) => !sql.includes("store_sales_attribution_dataset")
    ),
    "Fixed metric SQL must not calculate base metrics from the attribution dataset."
  );
  console.log("SQL metrics: store_sales_daily source constraint OK");
}

async function verifyLegacyParity(
  executor: MySqlSqlMetricQueryExecutor,
  scope: { storeIds: string[]; startDate: string; endDate: string },
  salesData: Awaited<ReturnType<MySqlSalesDataSource["loadSalesData"]>>
): Promise<void> {
  const achievement = (await executor.execute("achievement_rate", scope))
    .data as {
    overall: { totalSales: number; totalTarget: number; achievementRate: number };
  };
  const legacyAchievement = computeAchievementRate(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.deepEqual(
    normalizeNumbers(achievement.overall),
    normalizeNumbers(legacyAchievement.overall)
  );

  const order = (await executor.execute("order_trend", scope)).data as {
    stores: Array<Record<string, unknown>>;
  };
  const legacyOrder = computeOrderTrend(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.deepEqual(
    normalizeNumbers(order.stores),
    normalizeNumbers(legacyOrder.stores)
  );

  const aov = (await executor.execute("aov_trend", scope)).data as {
    stores: Array<Record<string, unknown>>;
  };
  const legacyAov = computeAOVTrend(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.deepEqual(
    normalizeNumbers(aov.stores),
    normalizeNumbers(legacyAov.stores)
  );

  const channel = (await executor.execute("channel_mix", scope)).data as {
    channelPct: Array<Record<string, unknown>>;
  };
  const legacyChannel = computeChannelMix(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.deepEqual(
    normalizeNumbers(channel.channelPct),
    normalizeNumbers(legacyChannel.channelPct)
  );

  const daypart = (await executor.execute("daypart_analysis", scope)).data as {
    daypartPct: Array<Record<string, unknown>>;
  };
  const legacyDaypart = computeDaypartAnalysis(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.deepEqual(
    normalizeNumbers(daypart.daypartPct),
    normalizeNumbers(legacyDaypart.daypartPct)
  );

  const promotion = (await executor.execute("promotion_contribution", scope))
    .data as {
    totalSales: number;
    totalDiscount: number;
    totalPromoUnits: number;
    contributionRate: number;
  };
  const legacyPromotion = computePromotionContribution(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.equal(promotion.totalSales, legacyPromotion.totalSales);
  assert.equal(promotion.totalDiscount, legacyPromotion.totalDiscount);
  assert.equal(promotion.totalPromoUnits, legacyPromotion.totalPromoUnits);
  assert.equal(promotion.contributionRate, legacyPromotion.contributionRate);

  const refund = (await executor.execute("refund_rate", scope)).data as {
    totalSales: number;
    totalRefund: number;
    totalCancelled: number;
    totalOrders: number;
    refundRate: number;
    cancelRate: number;
  };
  const legacyRefund = computeRefundRate(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assert.equal(refund.totalSales, legacyRefund.totalSales);
  assert.equal(refund.totalRefund, legacyRefund.totalRefund);
  assert.equal(refund.totalCancelled, legacyRefund.totalCancelled);
  assert.equal(refund.totalOrders, legacyRefund.totalOrders);
  assert.equal(refund.refundRate, legacyRefund.refundRate);
  assert.equal(refund.cancelRate, legacyRefund.cancelRate);
}

function normalizeNumbers(value: unknown): unknown {
  if (typeof value === "number") {
    return Math.round(value * 100_000_000) / 100_000_000;
  }
  if (Array.isArray(value)) return value.map(normalizeNumbers);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeNumbers(item)])
    );
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SQL metric check failed.");
  process.exitCode = 1;
});
