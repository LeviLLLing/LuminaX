import type { Pool, QueryOptions, RowDataPacket } from "mysql2/promise";
import type { DatabaseConnectionConfig } from "@/modules/data-source/data-source";
import {
  createMySqlPool,
  readMySqlQueryTimeout,
} from "@/modules/data-source/mysql-pool";
import type { AttributionData } from "@/modules/attribution/attribution-types";
import {
  normalizeExternalStoreRecord,
  toDatabaseStoreId,
  toExternalStoreId,
} from "@/modules/domain/store-identity";
import {
  type SqlMetricExecution,
  type SqlMetricIntent,
  type SqlMetricQueryExecutor,
  SqlMetricQueryError,
  type SqlMetricScope,
} from "@/modules/metrics/sql-metric-query-executor";
import {
  ACHIEVEMENT_RATE_SQL,
  ANOMALY_DETECTION_SQL,
  AOV_TREND_SQL,
  ATTRIBUTION_BREAKDOWN_SQL,
  ATTRIBUTION_CHANNEL_DAILY_SQL,
  ATTRIBUTION_DAILY_SQL,
  ATTRIBUTION_FEEDBACK_SQL,
  ATTRIBUTION_PROMOTION_SQL,
  ATTRIBUTION_REFUND_SQL,
  ATTRIBUTION_STORES_SQL,
  ATTRIBUTION_SUMMARY_SQL,
  CHANNEL_MIX_SQL,
  COMPARE_BREAKDOWN_SQL,
  COMPARE_DAILY_SQL,
  COMPARE_FEEDBACK_SQL,
  COMPARE_SUMMARY_SQL,
  DAYPART_MIX_SQL,
  LIST_STORES_SQL,
  ORDER_TREND_SQL,
  PROMOTION_CONTRIBUTION_SQL,
  REFUND_RATE_SQL,
  REPORT_BREAKDOWN_SQL,
  REPORT_DAILY_SQL,
  REPORT_STORE_RANKING_SQL,
  REPORT_SUMMARY_SQL,
} from "./mysql-metric-queries";

interface StoreIdRow extends RowDataPacket {
  storeId: string;
}

interface AchievementRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  date: string;
  actualSales: number;
  salesTarget: number;
  dailyGap: number;
  dailyAchievementRate: number;
  totalSales: number;
  totalTarget: number;
  storeGap: number;
  storeAchievementRate: number;
  overallTotalSales: number;
  overallTotalTarget: number;
  overallGap: number;
  overallAchievementRate: number;
}

interface OrderTrendRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  date: string;
  orders: number;
  orderTarget: number;
  totalOrders: number;
  totalOrderTarget: number;
  orderAchievementRate: number;
  trendDirection: string;
  trendPct: number;
}

interface AovTrendRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  date: string;
  aov: number;
  aovTarget: number;
  avgAOV: number;
  targetAOV: number;
  aovGap: number;
  trendDirection: string;
  trendPct: number;
}

interface MixRow extends RowDataPacket {
  scopeType: "overall" | "store";
  storeId: string | null;
  storeName: string | null;
  channel?: string;
  daypart?: string;
  sales: number;
  orders: number;
  avgOrderValue?: number;
  salesPct: number;
}

interface PromotionRow extends RowDataPacket {
  scopeType: "overall" | "overall_detail" | "store" | "store_detail";
  storeId: string | null;
  storeName: string | null;
  promotionName: string | null;
  totalSales: number;
  totalDiscount: number;
  totalPromoUnits: number;
  contributionRate: number;
  discountAmount: number | null;
  promoUnits: number | null;
  discountPct: number | null;
}

interface RefundRow extends RowDataPacket {
  scopeType: "overall" | "daily" | "store";
  date: string | null;
  storeId: string | null;
  storeName: string | null;
  totalSales: number;
  totalRefund: number;
  totalCancelled: number;
  totalOrders: number;
  refundRate: number;
  cancelRate: number;
}

interface AnomalyRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  date: string;
  actualSales: number;
  salesTarget: number;
  achievementRate: number;
  orderCount: number;
  avgOrderValue: number;
  refundAmount: number;
  cancelledOrders: number;
  zScore: number;
  meanSales: number;
  stdDev: number;
  isAnomaly: number;
  reasonText: string;
}

interface CompareSummaryRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  totalSales: number;
  totalTarget: number;
  achievementRate: string;
  totalOrders: number;
  avgOrderValue: number;
  totalRefund: number;
  totalCancelled: number;
  refundRate: string;
}

interface CompareDailyRow extends RowDataPacket {
  storeId: string;
  date: string;
  actualSales: number;
  salesTarget: number;
}

interface BreakdownRow extends RowDataPacket {
  dimensionType: "channel" | "category" | "daypart";
  dimensionName: string;
  value: number;
  storeId?: string;
  pct?: number;
}

interface CompareFeedbackRow extends RowDataPacket {
  date: string;
  storeId: string;
  feedbackType: string;
  feedbackDetail: string;
  affectedDaypart: string;
  affectedChannel: string;
}

interface AttributionSummaryRow extends RowDataPacket {
  totalSales: number;
  totalTarget: number;
  achievementRate: number;
  totalOrders: number;
  avgOrderValue: number;
  avgDailySales: number;
  avgDailyOrders: number;
  historicalAOV: number;
  actualDailySales: number;
  actualDailyOrders: number;
  salesDrop: number;
  ordersDrop: number;
  aovDrop: number;
  mainIssue: AttributionData["orderVsAov"]["mainIssue"];
  totalRefund: number;
  totalCancelled: number;
  refundRate: number;
}

interface AttributionStoreRow extends RowDataPacket {
  storeId: string;
  storeName: string;
}

interface AttributionDailyRow extends RowDataPacket {
  date: string;
  actualSales: number;
  salesTarget: number;
  achievementRate: number;
  orderCount: number;
  avgOrderValue: number;
}

interface AttributionChannelDailyRow extends RowDataPacket {
  date: string;
  channel: string;
  salesAmount: number;
  orderCount: number;
}

interface AttributionRefundRow extends RowDataPacket {
  scopeType: "daily" | "store";
  date: string | null;
  storeId: string | null;
  storeName: string | null;
  refundAmount: number;
  cancelledOrders: number;
  refundRate: number;
}

interface AttributionFeedbackRow extends RowDataPacket {
  date: string;
  store_id: string;
  feedback_type: string;
  feedback_detail: string;
  manager_name: string;
}

interface AttributionPromotionRow extends RowDataPacket {
  promotion_name: string;
  promo_sales: number;
  promo_orders: number;
  totalDiscount: number;
  totalPromoUnits: number;
  promoCount: number;
  salesRank: number;
}

interface ReportSummaryRow extends RowDataPacket {
  storeCount: number;
  totalSales: number;
  totalTarget: number;
  achievementRate: number;
  totalOrders: number;
  avgAOV: number;
  totalRefund: number;
  refundRate: number;
  totalCancelled: number;
  totalPromo: number;
  promoRate: number;
}

interface ReportStoreRow extends RowDataPacket {
  storeId: string;
  storeName: string;
  totalSales: number;
  totalTarget: number;
  achievementRate: number;
  salesRank: number;
}

interface ReportDailyRow extends RowDataPacket {
  date: string;
  sales: number;
  target: number;
  orders: number;
  avgAOV: number;
  salesRankDesc: number;
  salesRankAsc: number;
  isAnomaly: number;
  weekendAvg: number;
  weekdayAvg: number;
  weekendVs: number;
}

export class MySqlSqlMetricQueryExecutor implements SqlMetricQueryExecutor {
  private readonly pool: Pool;
  private readonly queryTimeoutMs: number;

  constructor(config: DatabaseConnectionConfig) {
    this.pool = createMySqlPool(config);
    this.queryTimeoutMs = readMySqlQueryTimeout();
  }

  async listStoreIds(): Promise<string[]> {
    try {
      const rows = await this.queryRows<StoreIdRow>(LIST_STORES_SQL);
      return rows.map((row) => toExternalStoreId(row.storeId));
    } catch (error) {
      throw new SqlMetricQueryError("无法从 SQL 获取门店范围。", {
        cause: error,
      });
    }
  }

  async execute(
    intent: SqlMetricIntent,
    scope: SqlMetricScope
  ): Promise<SqlMetricExecution> {
    validateScope(scope);

    try {
      const data = await this.executeFixedQuery(intent, scope);
      return { intent, source: "sql", data };
    } catch (error) {
      throw new SqlMetricQueryError(`SQL 指标 ${intent} 执行失败。`, {
        cause: error,
      });
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async executeFixedQuery(
    intent: SqlMetricIntent,
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    switch (intent) {
      case "achievement_rate":
        return this.executeAchievementRate(scope);
      case "order_trend":
        return this.executeOrderTrend(scope);
      case "aov_trend":
        return this.executeAovTrend(scope);
      case "channel_mix":
        return this.executeMix(scope, "channel");
      case "daypart_analysis":
        return this.executeMix(scope, "daypart");
      case "promotion_contribution":
        return this.executePromotion(scope);
      case "refund_rate":
        return this.executeRefund(scope);
      case "anomaly_detection":
        return this.executeAnomaly(scope);
      case "compare":
        return this.executeCompare(scope);
      case "attribution":
        return this.executeAttribution(scope);
      case "report":
        return this.executeReport(scope);
    }
  }

  private async executeAchievementRate(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<AchievementRow>(
      ACHIEVEMENT_RATE_SQL,
      scope
    );
    if (rows.length === 0) return null;

    const stores = groupRows(rows, (row) => row.storeId).map((storeRows) => {
      const first = storeRows[0];
      return {
        storeId: first.storeId,
        storeName: first.storeName,
        totalSales: first.totalSales,
        totalTarget: first.totalTarget,
        gap: first.storeGap,
        achievementRate: first.storeAchievementRate,
        dailyAchievement: storeRows.map((row) => ({
          date: row.date,
          actualSales: row.actualSales,
          salesTarget: row.salesTarget,
          gap: row.dailyGap,
          achievementRate: row.dailyAchievementRate,
        })),
      };
    });
    const first = rows[0];
    return {
      dateRange: dateRange(scope),
      stores,
      overall: {
        totalSales: first.overallTotalSales,
        totalTarget: first.overallTotalTarget,
        gap: first.overallGap,
        achievementRate: first.overallAchievementRate,
      },
    };
  }

  private async executeOrderTrend(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<OrderTrendRow>(ORDER_TREND_SQL, scope);
    if (rows.length === 0) return null;
    return {
      dateRange: dateRange(scope),
      stores: groupRows(rows, (row) => row.storeId).map((storeRows) => {
        const first = storeRows[0];
        return {
          storeId: first.storeId,
          storeName: first.storeName,
          totalOrders: first.totalOrders,
          totalOrderTarget: first.totalOrderTarget,
          orderAchievementRate: first.orderAchievementRate,
          dailyOrders: storeRows.map((row) => ({
            date: row.date,
            orders: row.orders,
            orderTarget: row.orderTarget,
          })),
          trendDirection: first.trendDirection,
          trendPct: first.trendPct,
        };
      }),
    };
  }

  private async executeAovTrend(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<AovTrendRow>(AOV_TREND_SQL, scope);
    if (rows.length === 0) return null;
    return {
      dateRange: dateRange(scope),
      stores: groupRows(rows, (row) => row.storeId).map((storeRows) => {
        const first = storeRows[0];
        return {
          storeId: first.storeId,
          storeName: first.storeName,
          avgAOV: first.avgAOV,
          targetAOV: first.targetAOV,
          aovGap: first.aovGap,
          dailyAOV: storeRows.map((row) => ({
            date: row.date,
            aov: row.aov,
            aovTarget: row.aovTarget,
          })),
          trendDirection: first.trendDirection,
          trendPct: first.trendPct,
        };
      }),
    };
  }

  private async executeMix(
    scope: SqlMetricScope,
    dimension: "channel" | "daypart"
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<MixRow>(
      dimension === "channel" ? CHANNEL_MIX_SQL : DAYPART_MIX_SQL,
      scope
    );
    if (rows.length === 0) return null;
    const nameKey = dimension === "channel" ? "channel" : "daypart";
    const toItem = (row: MixRow) => ({
      [nameKey]: dimension === "channel" ? row.channel : row.daypart,
      sales: row.sales,
      orders: row.orders,
      ...(dimension === "daypart"
        ? { avgOrderValue: row.avgOrderValue || 0 }
        : {}),
      salesPct: row.salesPct,
    });

    const overall = rows.filter((row) => row.scopeType === "overall");
    const storeRows = rows.filter(
      (row): row is MixRow & { storeId: string; storeName: string } =>
        row.scopeType === "store" && Boolean(row.storeId) && Boolean(row.storeName)
    );
    return {
      dateRange: dateRange(scope),
      [dimension === "channel" ? "channelPct" : "daypartPct"]:
        overall.map(toItem),
      byStore: groupRows(storeRows, (row) => row.storeId).map((items) => ({
        storeId: items[0].storeId,
        storeName: items[0].storeName,
        [dimension === "channel" ? "channels" : "dayparts"]:
          items.map(toItem),
      })),
    };
  }

  private async executePromotion(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<PromotionRow>(
      PROMOTION_CONTRIBUTION_SQL,
      scope
    );
    const overall = rows.find((row) => row.scopeType === "overall");
    if (!overall) return null;
    const storeSummaries = rows.filter(
      (row): row is PromotionRow & { storeId: string; storeName: string } =>
        row.scopeType === "store" && Boolean(row.storeId) && Boolean(row.storeName)
    );
    return {
      dateRange: dateRange(scope),
      totalSales: overall.totalSales,
      totalDiscount: overall.totalDiscount,
      totalPromoUnits: overall.totalPromoUnits,
      contributionRate: overall.contributionRate,
      promotionDetails: rows
        .filter((row) => row.scopeType === "overall_detail")
        .map((row) => ({
          promotionName: row.promotionName || "未命名促销",
          discountAmount: row.discountAmount || 0,
          promoUnits: row.promoUnits || 0,
          discountPct: row.discountPct || 0,
        })),
      byStore: storeSummaries.map((store) => ({
        storeId: store.storeId,
        storeName: store.storeName,
        totalSales: store.totalSales,
        totalDiscount: store.totalDiscount,
        totalPromoUnits: store.totalPromoUnits,
        contributionRate: store.contributionRate,
        promotions: rows
          .filter(
            (row) =>
              row.scopeType === "store_detail" && row.storeId === store.storeId
          )
          .map((row) => ({
            promotionName: row.promotionName || "未命名促销",
            discountAmount: row.discountAmount || 0,
            promoUnits: row.promoUnits || 0,
          })),
      })),
    };
  }

  private async executeRefund(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<RefundRow>(REFUND_RATE_SQL, scope);
    const overall = rows.find((row) => row.scopeType === "overall");
    if (!overall) return null;
    return {
      dateRange: dateRange(scope),
      totalSales: overall.totalSales,
      totalRefund: overall.totalRefund,
      totalCancelled: overall.totalCancelled,
      totalOrders: overall.totalOrders,
      refundRate: overall.refundRate,
      cancelRate: overall.cancelRate,
      dailyRefund: rows
        .filter((row) => row.scopeType === "daily" && row.date)
        .map((row) => ({
          date: row.date,
          refundAmount: row.totalRefund,
          cancelledOrders: row.totalCancelled,
          refundRate: row.refundRate,
          cancelRate: row.cancelRate,
        })),
      byStore: rows
        .filter(
          (row): row is RefundRow & { storeId: string; storeName: string } =>
            row.scopeType === "store" && Boolean(row.storeId) && Boolean(row.storeName)
        )
        .map((row) => ({
          storeId: row.storeId,
          storeName: row.storeName,
          totalSales: row.totalSales,
          refundAmount: row.totalRefund,
          cancelledOrders: row.totalCancelled,
          refundRate: row.refundRate,
          cancelRate: row.cancelRate,
        })),
    };
  }

  private async executeAnomaly(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.queryScoped<AnomalyRow>(
      ANOMALY_DETECTION_SQL,
      scope
    );
    if (rows.length === 0) return null;
    return {
      dateRange: dateRange(scope),
      stores: groupRows(rows, (row) => row.storeId).map((storeRows) => {
        const first = storeRows[0];
        const anomalyDays = storeRows
          .filter((row) => row.isAnomaly === 1)
          .map((row) => ({
            date: row.date,
            actualSales: row.actualSales,
            salesTarget: row.salesTarget,
            achievementRate: row.achievementRate,
            orderCount: row.orderCount,
            avgOrderValue: row.avgOrderValue,
            refundAmount: row.refundAmount,
            cancelledOrders: row.cancelledOrders,
            zScore: row.zScore,
            isAnomaly: true,
            reasons: row.reasonText ? row.reasonText.split("；") : [],
          }));
        return {
          storeId: first.storeId,
          storeName: first.storeName,
          meanSales: first.meanSales,
          stdDev: first.stdDev,
          anomalyDays,
          anomalyCount: anomalyDays.length,
        };
      }),
    };
  }

  private async executeCompare(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const [summaries, daily, breakdowns, feedback] = await Promise.all([
      this.queryScoped<CompareSummaryRow>(COMPARE_SUMMARY_SQL, scope),
      this.queryScoped<CompareDailyRow>(COMPARE_DAILY_SQL, scope),
      this.queryScoped<BreakdownRow>(COMPARE_BREAKDOWN_SQL, scope),
      this.queryScoped<CompareFeedbackRow>(COMPARE_FEEDBACK_SQL, scope),
    ]);
    if (summaries.length === 0) return null;
    return {
      dateRange: dateRange(scope),
      stores: summaries.map((summary) => ({
        ...summary,
        channelBreakdown: toBreakdownRecord(
          breakdowns.filter(
            (row) => row.storeId === summary.storeId && row.dimensionType === "channel"
          )
        ),
        categoryBreakdown: toBreakdownRecord(
          breakdowns.filter(
            (row) => row.storeId === summary.storeId && row.dimensionType === "category"
          )
        ),
        daypartBreakdown: toBreakdownRecord(
          breakdowns.filter(
            (row) => row.storeId === summary.storeId && row.dimensionType === "daypart"
          )
        ),
        dailySales: daily
          .filter((row) => row.storeId === summary.storeId)
          .map((row) => ({
            date: row.date,
            actual_sales: row.actualSales,
            sales_target: row.salesTarget,
          })),
      })),
      anomalies: feedback.map((row) => ({
        date: row.date,
        store_id: row.storeId,
        feedback_type: row.feedbackType,
        feedback_detail: row.feedbackDetail,
        affected_daypart: row.affectedDaypart,
        affected_channel: row.affectedChannel,
      })),
    };
  }

  private async executeAttribution(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const [
      summaries,
      stores,
      daily,
      breakdowns,
      channelDaily,
      refunds,
      feedback,
      promotions,
    ] = await Promise.all([
      this.queryScoped<AttributionSummaryRow>(ATTRIBUTION_SUMMARY_SQL, scope),
      this.queryScoped<AttributionStoreRow>(ATTRIBUTION_STORES_SQL, scope),
      this.queryScoped<AttributionDailyRow>(ATTRIBUTION_DAILY_SQL, scope),
      this.queryScoped<BreakdownRow>(ATTRIBUTION_BREAKDOWN_SQL, scope),
      this.queryScoped<AttributionChannelDailyRow>(ATTRIBUTION_CHANNEL_DAILY_SQL, scope),
      this.queryScoped<AttributionRefundRow>(ATTRIBUTION_REFUND_SQL, scope),
      this.queryScoped<AttributionFeedbackRow>(ATTRIBUTION_FEEDBACK_SQL, scope),
      this.queryScoped<AttributionPromotionRow>(ATTRIBUTION_PROMOTION_SQL, scope),
    ]);
    const summary = summaries[0];
    if (!summary) return null;
    const promotion = promotions[0];
    const data: AttributionData = {
      dateRange: dateRange(scope),
      storeIds: scope.storeIds,
      storeNames: Object.fromEntries(
        stores.map((store) => [store.storeId, store.storeName])
      ),
      salesSummary: {
        totalSales: summary.totalSales,
        totalTarget: summary.totalTarget,
        achievementRate: summary.achievementRate,
        totalOrders: summary.totalOrders,
        avgOrderValue: summary.avgOrderValue,
      },
      dailyDetail: daily,
      orderVsAov: {
        avgDailySales: summary.avgDailySales,
        avgDailyOrders: summary.avgDailyOrders,
        avgAOV: summary.historicalAOV,
        actualDailySales: summary.actualDailySales,
        actualDailyOrders: summary.actualDailyOrders,
        salesDrop: summary.salesDrop,
        ordersDrop: summary.ordersDrop,
        aovDrop: summary.aovDrop,
        mainIssue: summary.mainIssue,
      },
      channelBreakdown: toBreakdownRecord(
        breakdowns.filter((row) => row.dimensionType === "channel")
      ),
      categoryBreakdown: toBreakdownRecord(
        breakdowns.filter((row) => row.dimensionType === "category")
      ),
      daypartBreakdown: toBreakdownRecord(
        breakdowns.filter((row) => row.dimensionType === "daypart")
      ),
      channelDaily,
      refundSummary: {
        totalRefund: summary.totalRefund,
        totalCancelled: summary.totalCancelled,
        refundRate: summary.refundRate,
      },
      refundDaily: refunds
        .filter((row) => row.scopeType === "daily" && row.date)
        .map((row) => ({
          date: row.date || "",
          refundAmount: row.refundAmount,
          refundRate: row.refundRate,
          cancelledOrders: row.cancelledOrders,
        })),
      refundByStore: refunds
        .filter(
          (row): row is AttributionRefundRow & {
            storeId: string;
            storeName: string;
          } => row.scopeType === "store" && Boolean(row.storeId) && Boolean(row.storeName)
        )
        .map((row) => ({
          storeId: row.storeId,
          storeName: row.storeName,
          refundAmount: row.refundAmount,
          cancelledOrders: row.cancelledOrders,
          refundRate: row.refundRate,
        })),
      managerFeedback: feedback,
      promotionSummary: {
        totalDiscount: promotion?.totalDiscount || 0,
        totalPromoUnits: promotion?.totalPromoUnits || 0,
        promoCount: promotion?.promoCount || 0,
        topPromotions: promotions
          .filter((row) => row.salesRank <= 5)
          .map((row) => ({
            promotion_name: row.promotion_name,
            promo_sales: row.promo_sales,
            promo_orders: row.promo_orders,
          })),
      },
    };
    return data as unknown as Record<string, unknown>;
  }

  private async executeReport(
    scope: SqlMetricScope
  ): Promise<Record<string, unknown> | null> {
    const [summaries, stores, daily, breakdowns] = await Promise.all([
      this.queryScoped<ReportSummaryRow>(REPORT_SUMMARY_SQL, scope),
      this.queryScoped<ReportStoreRow>(REPORT_STORE_RANKING_SQL, scope),
      this.queryScoped<ReportDailyRow>(REPORT_DAILY_SQL, scope),
      this.queryScoped<BreakdownRow>(REPORT_BREAKDOWN_SQL, scope),
    ]);
    const summary = summaries[0];
    if (!summary) return null;
    return {
      dateRange: dateRange(scope),
      summary,
      storeRanking: stores,
      dailyTrend: daily,
      channelBreakdown: breakdowns.filter(
        (row) => row.dimensionType === "channel"
      ),
      categoryBreakdown: breakdowns.filter(
        (row) => row.dimensionType === "category"
      ),
      daypartBreakdown: breakdowns.filter(
        (row) => row.dimensionType === "daypart"
      ),
    };
  }

  private queryScoped<TRow extends RowDataPacket>(
    sql: string,
    scope: SqlMetricScope
  ): Promise<TRow[]> {
    return this.queryRows<TRow>(sql, [
      JSON.stringify(scope.storeIds.map(toDatabaseStoreId)),
      scope.startDate,
      scope.endDate,
    ]);
  }

  private async queryRows<TRow extends RowDataPacket>(
    sql: string,
    values: unknown[] = []
  ): Promise<TRow[]> {
    const options: QueryOptions = { sql, values, timeout: this.queryTimeoutMs };
    const [rows] = await this.pool.query<TRow[]>(options);
    return rows.map((row) => normalizeExternalStoreRecord(row));
  }
}

function validateScope(scope: SqlMetricScope): void {
  if (scope.storeIds.length === 0) {
    throw new SqlMetricQueryError("SQL 指标必须指定至少一家门店。");
  }
  if (!scope.storeIds.every((storeId) => /^S\d{3}$/.test(storeId))) {
    throw new SqlMetricQueryError("SQL 指标包含无效门店编号。");
  }
  if (!isIsoDate(scope.startDate) || !isIsoDate(scope.endDate)) {
    throw new SqlMetricQueryError("SQL 指标日期必须使用 YYYY-MM-DD 格式。");
  }
  if (scope.startDate > scope.endDate) {
    throw new SqlMetricQueryError("SQL 指标开始日期不能晚于结束日期。");
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateRange(scope: SqlMetricScope): { start: string; end: string } {
  return { start: scope.startDate, end: scope.endDate };
}

function groupRows<TRow>(
  rows: TRow[],
  getKey: (row: TRow) => string
): TRow[][] {
  const groups = new Map<string, TRow[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function toBreakdownRecord(
  rows: BreakdownRow[]
): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.dimensionName, row.value]));
}
