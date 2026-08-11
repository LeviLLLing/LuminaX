import {
  type Pool,
  type QueryOptions,
  type RowDataPacket,
} from "mysql2/promise";
import type {
  DatabaseConnectionConfig,
  SalesDataSource,
} from "@/modules/data-source/data-source";
import {
  createMySqlPool,
  readMySqlQueryTimeout,
} from "@/modules/data-source/mysql-pool";
import type {
  AttributionDataset,
  PromotionDaily,
  RefundCancelDaily,
  SalesByCategory,
  SalesByChannel,
  SalesByDaypart,
  SalesData,
  SalesTargetDaily,
  StoreManagerFeedback,
  StoreMaster,
  StoreSalesDaily,
} from "@/modules/domain/sales-data";
import { normalizeExternalStoreRecord } from "@/modules/domain/store-identity";

const DEFAULT_CACHE_TTL_MS = 30_000;

const QUERIES = {
  storeMaster: `
    SELECT store_id, store_name, region, city, store_type,
           opening_date, area_type
    FROM store_master
    ORDER BY store_id
  `,
  storeSalesDaily: `
    SELECT date, store_id, actual_sales, order_count, customer_count,
           avg_order_value, refund_amount, cancelled_orders
    FROM store_sales_daily
    ORDER BY date, store_id
  `,
  salesTargetDaily: `
    SELECT date, store_id, sales_target, order_target, aov_target
    FROM sales_target_daily
    ORDER BY date, store_id
  `,
  salesByChannel: `
    SELECT date, store_id, channel, sales_amount, order_count
    FROM sales_by_channel
    ORDER BY date, store_id, channel
  `,
  salesByDaypart: `
    SELECT date, store_id, daypart, sales_amount, order_count
    FROM sales_by_daypart
    ORDER BY date, store_id, daypart
  `,
  salesByCategory: `
    SELECT date, store_id, category, sales_amount, order_count
    FROM sales_by_category
    ORDER BY date, store_id, category
  `,
  promotionDaily: `
    SELECT date, store_id, promotion_id, promotion_name, product_scope,
           promo_sales, promo_orders, coupon_used
    FROM promotion_daily
    ORDER BY date, store_id, promotion_id
  `,
  refundCancelDaily: `
    SELECT date, store_id, refund_amount, refund_orders, cancelled_orders,
           main_reason
    FROM refund_cancel_daily
    ORDER BY date, store_id
  `,
  storeManagerFeedback: `
    SELECT date, store_id, feedback_type, feedback_detail, affected_daypart,
           affected_channel, manager_name
    FROM store_manager_feedback
    ORDER BY date, store_id
  `,
  attributionDataset: `
    SELECT date, store_id, store_name, actual_sales, sales_target,
           achievement_rate, order_count, avg_order_value, top_channel,
           weak_daypart, top_category, promo_sales, refund_amount,
           manager_feedback
    FROM store_sales_attribution_dataset
    ORDER BY date, store_id
  `,
} as const;

export class MySqlSalesDataSource implements SalesDataSource {
  private readonly pool: Pool;
  private readonly cacheTtlMs: number;
  private readonly queryTimeoutMs: number;
  private cachedData: SalesData | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly config: DatabaseConnectionConfig) {
    this.cacheTtlMs = readPositiveNumber(
      process.env.MYSQL_CACHE_TTL_MS,
      DEFAULT_CACHE_TTL_MS
    );
    this.queryTimeoutMs = readMySqlQueryTimeout();
    this.pool = createMySqlPool(config);
  }

  async loadSalesData(): Promise<SalesData> {
    if (this.cachedData && Date.now() < this.cacheExpiresAt) {
      return this.cachedData;
    }

    try {
      const [
        storeMaster,
        storeSalesDaily,
        salesTargetDaily,
        salesByChannel,
        salesByDaypart,
        salesByCategory,
        promotionDaily,
        refundCancelDaily,
        storeManagerFeedback,
        attributionDataset,
      ] = await Promise.all([
        this.queryRows<StoreMaster>(QUERIES.storeMaster),
        this.queryRows<StoreSalesDaily>(QUERIES.storeSalesDaily),
        this.queryRows<SalesTargetDaily>(QUERIES.salesTargetDaily),
        this.queryRows<SalesByChannel>(QUERIES.salesByChannel),
        this.queryRows<SalesByDaypart>(QUERIES.salesByDaypart),
        this.queryRows<SalesByCategory>(QUERIES.salesByCategory),
        this.queryRows<PromotionDaily>(QUERIES.promotionDaily),
        this.queryRows<RefundCancelDaily>(QUERIES.refundCancelDaily),
        this.queryRows<StoreManagerFeedback>(QUERIES.storeManagerFeedback),
        this.queryRows<AttributionDataset>(QUERIES.attributionDataset),
      ]);

      this.cachedData = {
        store_master: storeMaster,
        store_sales_daily: storeSalesDaily,
        sales_target_daily: salesTargetDaily,
        sales_by_channel: salesByChannel,
        sales_by_daypart: salesByDaypart,
        sales_by_category: salesByCategory,
        promotion_daily: promotionDaily,
        refund_cancel_daily: refundCancelDaily,
        store_manager_feedback: storeManagerFeedback,
        store_sales_attribution_dataset: attributionDataset,
      };
      this.cacheExpiresAt = Date.now() + this.cacheTtlMs;
      return this.cachedData;
    } catch (error) {
      throw new Error(
        `无法从 MySQL 数据源 ${this.config.host}/${this.config.database} 读取 LuminaX 数据。`,
        { cause: error }
      );
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async queryRows<T>(sql: string): Promise<T[]> {
    const options: QueryOptions = {
      sql,
      timeout: this.queryTimeoutMs,
    };
    const [rows] = await this.pool.query<RowDataPacket[]>(options);
    return rows.map((row) =>
      normalizeExternalStoreRecord({ ...row }) as T
    );
  }
}

function readPositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
