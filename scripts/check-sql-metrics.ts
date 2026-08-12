import assert from "node:assert/strict";
import { config as loadEnvironment } from "dotenv";
import { formatLocalAnalysis } from "../src/modules/chat/local-answer-formatter";
import { readDatabaseConfig } from "../src/modules/data-source/data-source-factory";
import { MySqlSalesDataSource } from "../src/modules/data-source/mysql-sales-data-source";
import { computeAttributionData } from "../src/modules/attribution/attribution-engine";
import type { AttributionData } from "../src/modules/attribution/attribution-types";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "../src/modules/domain/constants";
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
  assertApproxDeepEqual(achievement.overall, legacyAchievement.overall);

  const order = (await executor.execute("order_trend", scope)).data as {
    stores: Array<Record<string, unknown>>;
  };
  const legacyOrder = computeOrderTrend(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assertApproxDeepEqual(order.stores, legacyOrder.stores);

  const aov = (await executor.execute("aov_trend", scope)).data as {
    stores: Array<Record<string, unknown>>;
  };
  const legacyAov = computeAOVTrend(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assertApproxDeepEqual(aov.stores, legacyAov.stores);

  const channel = (await executor.execute("channel_mix", scope)).data as {
    channelPct: Array<Record<string, unknown>>;
  };
  const legacyChannel = computeChannelMix(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assertApproxDeepEqual(channel.channelPct, legacyChannel.channelPct);

  const daypart = (await executor.execute("daypart_analysis", scope)).data as {
    daypartPct: Array<Record<string, unknown>>;
  };
  const legacyDaypart = computeDaypartAnalysis(
    scope.storeIds,
    scope.startDate,
    scope.endDate,
    salesData
  );
  assertApproxDeepEqual(daypart.daypartPct, legacyDaypart.daypartPct);

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
  assertApproxDeepEqual(promotion, legacyPromotion);

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
  // 与原脚本语义一致：只对比顶层标量；明细数组两侧排序规则不同，不纳入 parity
  assert.equal(refund.totalSales, legacyRefund.totalSales);
  assert.equal(refund.totalRefund, legacyRefund.totalRefund);
  assert.equal(refund.totalCancelled, legacyRefund.totalCancelled);
  assert.equal(refund.totalOrders, legacyRefund.totalOrders);
  assertApproxDeepEqual(refund.refundRate, legacyRefund.refundRate);
  assertApproxDeepEqual(refund.cancelRate, legacyRefund.cancelRate);

  const attribution = (await executor.execute("attribution", scope)).data as
    | AttributionData
    | null;
  const legacyAttribution = computeAttributionData(
    {
      storeIds: scope.storeIds,
      startDate: scope.startDate,
      endDate: scope.endDate,
    },
    DEFAULT_START_DATE,
    DEFAULT_END_DATE,
    salesData
  );
  assert.ok(attribution, "attribution returned no data");
  assert.equal(
    attribution!.salesSummary.totalSales,
    legacyAttribution.salesSummary.totalSales
  );
  assert.equal(
    attribution!.decomposition?.totalGap,
    legacyAttribution.decomposition?.totalGap
  );
  assert.ok(
    (attribution!.factorContributions?.length ?? 0) > 0,
    "attribution factorContributions missing"
  );
  console.log("attribution: SQL/JS parity OK");
}

/**
 * 递归近似比较：MySQL 除法结果小数位随表达式变化（4~6 位），
 * 与遗留 JS 双精度结果之间存在浮点刻度差，使用容差比较。
 */
function assertApproxDeepEqual(
  actual: unknown,
  expected: unknown,
  epsilon = 0.001
): void {
  if (typeof actual === "number" && typeof expected === "number") {
    assert.ok(
      Math.abs(actual - expected) <= epsilon,
      `numbers differ: ${actual} vs ${expected}`
    );
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, "array length differs");
    actual.forEach((item, index) =>
      assertApproxDeepEqual(item, expected[index], epsilon)
    );
    return;
  }
  if (
    actual &&
    expected &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    const actualKeys = Object.keys(actual as Record<string, unknown>).sort();
    const expectedKeys = Object.keys(expected as Record<string, unknown>).sort();
    assert.deepEqual(actualKeys, expectedKeys, "object keys differ");
    for (const key of actualKeys) {
      assertApproxDeepEqual(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        epsilon
      );
    }
    return;
  }
  assert.deepEqual(actual, expected);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SQL metric check failed.");
  process.exitCode = 1;
});
