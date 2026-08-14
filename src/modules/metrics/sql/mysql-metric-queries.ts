export const LIST_STORES_SQL = `
  SELECT store_id AS storeId
  FROM store_master
  ORDER BY store_id
`;

export const ACHIEVEMENT_RATE_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  daily AS (
    SELECT
      sales.store_id,
      stores.store_name,
      sales.date,
      SUM(sales.actual_sales) AS actual_sales,
      COALESCE(SUM(targets.sales_target), 0) AS sales_target
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN store_sales_daily AS sales ON sales.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales_target_daily AS targets
      ON targets.store_id = sales.store_id AND targets.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY sales.store_id, stores.store_name, sales.date
  ),
  calculated AS (
    SELECT
      daily.*,
      SUM(actual_sales) OVER (PARTITION BY store_id) AS total_sales,
      SUM(sales_target) OVER (PARTITION BY store_id) AS total_target,
      SUM(actual_sales) OVER () AS overall_total_sales,
      SUM(sales_target) OVER () AS overall_total_target
    FROM daily
  )
  SELECT
    store_id AS storeId,
    store_name AS storeName,
    DATE_FORMAT(date, '%Y-%m-%d') AS date,
    actual_sales AS actualSales,
    sales_target AS salesTarget,
    actual_sales - sales_target AS dailyGap,
    CASE WHEN sales_target > 0 THEN actual_sales / sales_target * 100 ELSE 0 END
      AS dailyAchievementRate,
    total_sales AS totalSales,
    total_target AS totalTarget,
    total_sales - total_target AS storeGap,
    CASE WHEN total_target > 0 THEN total_sales / total_target * 100 ELSE 0 END
      AS storeAchievementRate,
    overall_total_sales AS overallTotalSales,
    overall_total_target AS overallTotalTarget,
    overall_total_sales - overall_total_target AS overallGap,
    CASE
      WHEN overall_total_target > 0
      THEN overall_total_sales / overall_total_target * 100
      ELSE 0
    END AS overallAchievementRate
  FROM calculated
  ORDER BY store_id, date
`;

export const ORDER_TREND_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  daily AS (
    SELECT
      sales.store_id,
      stores.store_name,
      sales.date,
      SUM(sales.order_count) AS orders,
      COALESCE(SUM(targets.order_target), 0) AS order_target
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN store_sales_daily AS sales ON sales.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales_target_daily AS targets
      ON targets.store_id = sales.store_id AND targets.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY sales.store_id, stores.store_name, sales.date
  ),
  numbered AS (
    SELECT
      daily.*,
      ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY date) AS row_num,
      COUNT(*) OVER (PARTITION BY store_id) AS row_count
    FROM daily
  ),
  metric_base AS (
    SELECT
      store_id,
      SUM(orders) AS total_orders,
      SUM(order_target) AS total_order_target,
      COALESCE(AVG(CASE WHEN row_num <= FLOOR(row_count / 2) THEN orders END), 0)
        AS first_half_avg,
      COALESCE(AVG(CASE WHEN row_num > FLOOR(row_count / 2) THEN orders END), 0)
        AS second_half_avg
    FROM numbered
    GROUP BY store_id
  ),
  metrics AS (
    SELECT
      metric_base.*,
      CASE
        WHEN total_order_target > 0 THEN total_orders / total_order_target * 100
        ELSE 0
      END AS order_achievement_rate,
      CASE
        WHEN second_half_avg > first_half_avg * 1.05 THEN '上升'
        WHEN second_half_avg < first_half_avg * 0.95 THEN '下降'
        ELSE '持平'
      END AS trend_direction,
      CASE
        WHEN first_half_avg > 0
        THEN (second_half_avg - first_half_avg) / first_half_avg * 100
        ELSE 0
      END AS trend_pct
    FROM metric_base
  )
  SELECT
    numbered.store_id AS storeId,
    numbered.store_name AS storeName,
    DATE_FORMAT(numbered.date, '%Y-%m-%d') AS date,
    numbered.orders,
    numbered.order_target AS orderTarget,
    metrics.total_orders AS totalOrders,
    metrics.total_order_target AS totalOrderTarget,
    metrics.order_achievement_rate AS orderAchievementRate,
    metrics.trend_direction AS trendDirection,
    metrics.trend_pct AS trendPct
  FROM numbered
  JOIN metrics ON metrics.store_id = numbered.store_id
  ORDER BY numbered.store_id, numbered.date
`;

export const AOV_TREND_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  daily AS (
    SELECT
      sales.store_id,
      stores.store_name,
      sales.date,
      ROUND(
        CASE WHEN SUM(sales.order_count) > 0
          THEN SUM(sales.actual_sales) / SUM(sales.order_count)
          ELSE 0
        END,
        2
      ) AS aov,
      ROUND(COALESCE(AVG(targets.aov_target), 0), 2) AS aov_target,
      SUM(sales.actual_sales) AS actual_sales,
      SUM(sales.order_count) AS order_count
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN store_sales_daily AS sales ON sales.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales_target_daily AS targets
      ON targets.store_id = sales.store_id AND targets.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY sales.store_id, stores.store_name, sales.date
  ),
  numbered AS (
    SELECT
      daily.*,
      ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY date) AS row_num,
      COUNT(*) OVER (PARTITION BY store_id) AS row_count
    FROM daily
  ),
  metric_base AS (
    SELECT
      store_id,
      ROUND(CASE WHEN SUM(order_count) > 0 THEN SUM(actual_sales) / SUM(order_count) ELSE 0 END, 2)
        AS avg_aov,
      ROUND(AVG(aov_target), 2) AS target_aov,
      COALESCE(AVG(CASE WHEN row_num <= FLOOR(row_count / 2) THEN aov END), 0)
        AS first_half_avg,
      COALESCE(AVG(CASE WHEN row_num > FLOOR(row_count / 2) THEN aov END), 0)
        AS second_half_avg
    FROM numbered
    GROUP BY store_id
  ),
  metrics AS (
    SELECT
      metric_base.*,
      ROUND(avg_aov - target_aov, 2) AS aov_gap,
      CASE
        WHEN second_half_avg > first_half_avg * 1.03 THEN '上升'
        WHEN second_half_avg < first_half_avg * 0.97 THEN '下降'
        ELSE '持平'
      END AS trend_direction,
      CASE
        WHEN first_half_avg > 0
        THEN (second_half_avg - first_half_avg) / first_half_avg * 100
        ELSE 0
      END AS trend_pct
    FROM metric_base
  )
  SELECT
    numbered.store_id AS storeId,
    numbered.store_name AS storeName,
    DATE_FORMAT(numbered.date, '%Y-%m-%d') AS date,
    numbered.aov,
    numbered.aov_target AS aovTarget,
    metrics.avg_aov AS avgAOV,
    metrics.target_aov AS targetAOV,
    metrics.aov_gap AS aovGap,
    metrics.trend_direction AS trendDirection,
    metrics.trend_pct AS trendPct
  FROM numbered
  JOIN metrics ON metrics.store_id = numbered.store_id
  ORDER BY numbered.store_id, numbered.date
`;

export const CHANNEL_MIX_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  store_totals AS (
    SELECT
      channels.store_id,
      stores.store_name,
      channels.channel AS dimension_name,
      SUM(channels.sales_amount) AS sales,
      SUM(channels.order_count) AS orders
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN sales_by_channel AS channels ON channels.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    WHERE channels.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY channels.store_id, stores.store_name, channels.channel
  ),
  combined AS (
    SELECT 'store' AS scope_type, store_id, store_name, dimension_name, sales, orders
    FROM store_totals
    UNION ALL
    SELECT 'overall', NULL, NULL, dimension_name, SUM(sales), SUM(orders)
    FROM store_totals
    GROUP BY dimension_name
  )
  SELECT
    scope_type AS scopeType,
    store_id AS storeId,
    store_name AS storeName,
    dimension_name AS channel,
    sales,
    orders,
    CASE
      WHEN SUM(sales) OVER (PARTITION BY scope_type, store_id) > 0
      THEN sales / SUM(sales) OVER (PARTITION BY scope_type, store_id) * 100
      ELSE 0
    END AS salesPct
  FROM combined
  ORDER BY scope_type, store_id, sales DESC
`;

export const DAYPART_MIX_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  store_totals AS (
    SELECT
      dayparts.store_id,
      stores.store_name,
      dayparts.daypart AS dimension_name,
      SUM(dayparts.sales_amount) AS sales,
      SUM(dayparts.order_count) AS orders
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN sales_by_daypart AS dayparts ON dayparts.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    WHERE dayparts.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY dayparts.store_id, stores.store_name, dayparts.daypart
  ),
  combined AS (
    SELECT 'store' AS scope_type, store_id, store_name, dimension_name, sales, orders
    FROM store_totals
    UNION ALL
    SELECT 'overall', NULL, NULL, dimension_name, SUM(sales), SUM(orders)
    FROM store_totals
    GROUP BY dimension_name
  )
  SELECT
    scope_type AS scopeType,
    store_id AS storeId,
    store_name AS storeName,
    dimension_name AS daypart,
    sales,
    orders,
    CASE WHEN orders > 0 THEN ROUND(sales / orders) ELSE 0 END AS avgOrderValue,
    CASE
      WHEN SUM(sales) OVER (PARTITION BY scope_type, store_id) > 0
      THEN sales / SUM(sales) OVER (PARTITION BY scope_type, store_id) * 100
      ELSE 0
    END AS salesPct
  FROM combined
  ORDER BY scope_type, store_id, sales DESC
`;

export const PROMOTION_CONTRIBUTION_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  store_sales AS (
    SELECT
      requested.store_id,
      stores.store_name,
      COALESCE(SUM(sales.actual_sales), 0) AS total_sales
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN store_sales_daily AS sales
      ON sales.store_id = requested.store_id
      AND sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY requested.store_id, stores.store_name
  ),
  store_promotions AS (
    SELECT
      promotions.store_id,
      promotions.promotion_name,
      SUM(promotions.promo_sales) AS promo_sales,
      SUM(promotions.promo_orders) AS promo_orders
    FROM requested_stores AS requested
    JOIN promotion_daily AS promotions ON promotions.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    WHERE promotions.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY promotions.store_id, promotions.promotion_name
  ),
  store_promotion_totals AS (
    SELECT
      store_id,
      SUM(promo_sales) AS total_promo_sales,
      SUM(promo_orders) AS total_promo_orders
    FROM store_promotions
    GROUP BY store_id
  ),
  overall_summary AS (
    SELECT
      SUM(store_sales.total_sales) AS total_sales,
      COALESCE(SUM(store_promotion_totals.total_promo_sales), 0) AS total_promo_sales,
      COALESCE(SUM(store_promotion_totals.total_promo_orders), 0) AS total_promo_orders
    FROM store_sales
    LEFT JOIN store_promotion_totals
      ON store_promotion_totals.store_id = store_sales.store_id
  ),
  overall_promotions AS (
    SELECT
      promotion_name,
      SUM(promo_sales) AS promo_sales,
      SUM(promo_orders) AS promo_orders
    FROM store_promotions
    GROUP BY promotion_name
  )
  SELECT
    'overall' AS scopeType,
    NULL AS storeId,
    NULL AS storeName,
    NULL AS promotionName,
    total_sales AS totalSales,
    total_promo_sales AS totalDiscount,
    total_promo_orders AS totalPromoUnits,
    CASE WHEN total_sales > 0 THEN total_promo_sales / total_sales * 100 ELSE 0 END
      AS contributionRate,
    NULL AS discountAmount,
    NULL AS promoUnits,
    NULL AS discountPct
  FROM overall_summary
  UNION ALL
  SELECT
    'overall_detail',
    NULL,
    NULL,
    overall_promotions.promotion_name,
    overall_summary.total_sales,
    overall_summary.total_promo_sales,
    overall_summary.total_promo_orders,
    CASE
      WHEN overall_summary.total_sales > 0
      THEN overall_summary.total_promo_sales / overall_summary.total_sales * 100
      ELSE 0
    END,
    overall_promotions.promo_sales,
    overall_promotions.promo_orders,
    CASE
      WHEN overall_summary.total_sales > 0
      THEN overall_promotions.promo_sales / overall_summary.total_sales * 100
      ELSE 0
    END
  FROM overall_promotions
  CROSS JOIN overall_summary
  UNION ALL
  SELECT
    'store',
    store_sales.store_id,
    store_sales.store_name,
    NULL,
    store_sales.total_sales,
    COALESCE(store_promotion_totals.total_promo_sales, 0),
    COALESCE(store_promotion_totals.total_promo_orders, 0),
    CASE
      WHEN store_sales.total_sales > 0
      THEN COALESCE(store_promotion_totals.total_promo_sales, 0) / store_sales.total_sales * 100
      ELSE 0
    END,
    NULL,
    NULL,
    NULL
  FROM store_sales
  LEFT JOIN store_promotion_totals
    ON store_promotion_totals.store_id = store_sales.store_id
  UNION ALL
  SELECT
    'store_detail',
    store_sales.store_id,
    store_sales.store_name,
    store_promotions.promotion_name,
    store_sales.total_sales,
    store_promotion_totals.total_promo_sales,
    store_promotion_totals.total_promo_orders,
    CASE
      WHEN store_sales.total_sales > 0
      THEN store_promotion_totals.total_promo_sales / store_sales.total_sales * 100
      ELSE 0
    END,
    store_promotions.promo_sales,
    store_promotions.promo_orders,
    CASE
      WHEN store_sales.total_sales > 0
      THEN store_promotions.promo_sales / store_sales.total_sales * 100
      ELSE 0
    END
  FROM store_promotions
  JOIN store_sales ON store_sales.store_id = store_promotions.store_id
  JOIN store_promotion_totals
    ON store_promotion_totals.store_id = store_promotions.store_id
  ORDER BY scopeType, storeId, discountAmount DESC
`;

export const REFUND_RATE_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  refunds AS (
    SELECT
      refund.store_id,
      refund.date,
      SUM(refund.refund_amount) AS refund_amount,
      SUM(refund.cancelled_orders) AS cancelled_orders
    FROM refund_cancel_daily AS refund
    JOIN requested_stores AS requested ON requested.store_id = refund.store_id
    CROSS JOIN requested_range AS date_range
    WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY refund.store_id, refund.date
  ),
  base AS (
    SELECT
      sales.store_id,
      stores.store_name,
      sales.date,
      SUM(sales.actual_sales) AS sales_amount,
      SUM(sales.order_count) AS orders,
      COALESCE(refunds.refund_amount, 0) AS refund_amount,
      COALESCE(refunds.cancelled_orders, 0) AS cancelled_orders
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN store_sales_daily AS sales ON sales.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN refunds
      ON refunds.store_id = sales.store_id AND refunds.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY
      sales.store_id, stores.store_name, sales.date,
      refunds.refund_amount, refunds.cancelled_orders
  )
  SELECT
    'overall' AS scopeType,
    NULL AS date,
    NULL AS storeId,
    NULL AS storeName,
    SUM(sales_amount) AS totalSales,
    SUM(refund_amount) AS totalRefund,
    SUM(cancelled_orders) AS totalCancelled,
    SUM(orders) AS totalOrders,
    CASE WHEN SUM(sales_amount) > 0 THEN SUM(refund_amount) / SUM(sales_amount) * 100 ELSE 0 END
      AS refundRate,
    CASE WHEN SUM(orders) > 0 THEN SUM(cancelled_orders) / SUM(orders) * 100 ELSE 0 END
      AS cancelRate
  FROM base
  UNION ALL
  SELECT
    'daily',
    DATE_FORMAT(date, '%Y-%m-%d'),
    NULL,
    NULL,
    SUM(sales_amount),
    SUM(refund_amount),
    SUM(cancelled_orders),
    SUM(orders),
    CASE WHEN SUM(sales_amount) > 0 THEN SUM(refund_amount) / SUM(sales_amount) * 100 ELSE 0 END,
    CASE WHEN SUM(orders) > 0 THEN SUM(cancelled_orders) / SUM(orders) * 100 ELSE 0 END
  FROM base
  GROUP BY date
  UNION ALL
  SELECT
    'store',
    NULL,
    store_id,
    store_name,
    SUM(sales_amount),
    SUM(refund_amount),
    SUM(cancelled_orders),
    SUM(orders),
    CASE WHEN SUM(sales_amount) > 0 THEN SUM(refund_amount) / SUM(sales_amount) * 100 ELSE 0 END,
    CASE WHEN SUM(orders) > 0 THEN SUM(cancelled_orders) / SUM(orders) * 100 ELSE 0 END
  FROM base
  GROUP BY store_id, store_name
  ORDER BY scopeType, refundRate DESC, date
`;

export const ANOMALY_DETECTION_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  refunds AS (
    SELECT
      refund.store_id,
      refund.date,
      SUM(refund.refund_amount) AS refund_amount,
      SUM(refund.cancelled_orders) AS cancelled_orders
    FROM refund_cancel_daily AS refund
    JOIN requested_stores AS requested ON requested.store_id = refund.store_id
    CROSS JOIN requested_range AS date_range
    WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY refund.store_id, refund.date
  ),
  base AS (
    SELECT
      sales.store_id,
      stores.store_name,
      sales.date,
      sales.actual_sales,
      sales.order_count,
      sales.avg_order_value,
      sales.refund_amount AS recorded_refund_amount,
      COALESCE(refunds.cancelled_orders, 0) AS recorded_cancelled_orders,
      COALESCE(targets.sales_target, 0) AS sales_target,
      COALESCE(refunds.refund_amount, 0) AS refund_amount,
      COALESCE(refunds.cancelled_orders, 0) AS cancelled_orders
    FROM requested_stores AS requested
    JOIN store_master AS stores ON stores.store_id = requested.store_id
    JOIN store_sales_daily AS sales ON sales.store_id = requested.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales_target_daily AS targets
      ON targets.store_id = sales.store_id AND targets.date = sales.date
    LEFT JOIN refunds
      ON refunds.store_id = sales.store_id AND refunds.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  statistics AS (
    SELECT
      store_id,
      AVG(actual_sales) AS mean_sales,
      COALESCE(STDDEV_SAMP(actual_sales), 0) AS std_dev
    FROM base
    GROUP BY store_id
  ),
  calculated AS (
    SELECT
      base.*,
      statistics.mean_sales,
      statistics.std_dev,
      CASE WHEN sales_target > 0 THEN actual_sales / sales_target * 100 ELSE 100 END
        AS achievement_rate,
      CASE WHEN statistics.std_dev > 0
        THEN (actual_sales - statistics.mean_sales) / statistics.std_dev
        ELSE 0
      END AS z_score,
      CASE WHEN actual_sales > 0 THEN refund_amount / actual_sales * 100 ELSE 0 END
        AS refund_rate
    FROM base
    JOIN statistics ON statistics.store_id = base.store_id
  )
  SELECT
    store_id AS storeId,
    store_name AS storeName,
    DATE_FORMAT(date, '%Y-%m-%d') AS date,
    actual_sales AS actualSales,
    sales_target AS salesTarget,
    achievement_rate AS achievementRate,
    order_count AS orderCount,
    avg_order_value AS avgOrderValue,
    recorded_refund_amount AS refundAmount,
    recorded_cancelled_orders AS cancelledOrders,
    ROUND(z_score, 2) AS zScore,
    ROUND(mean_sales) AS meanSales,
    ROUND(std_dev) AS stdDev,
    CASE
      WHEN achievement_rate < 90 OR ABS(z_score) > 1.5
        OR refund_rate > 2 OR cancelled_orders > 15
      THEN 1 ELSE 0
    END AS isAnomaly,
    CONCAT_WS('；',
      IF(achievement_rate < 90, CONCAT('达成率仅 ', ROUND(achievement_rate, 1), '%'), NULL),
      IF(z_score < -1.5, CONCAT('销售额显著低于均值 (Z=', ROUND(z_score, 2), ')'), NULL),
      IF(z_score > 1.5, CONCAT('销售额显著高于均值 (Z=', ROUND(z_score, 2), ')'), NULL),
      IF(refund_rate > 2, CONCAT('退款率偏高 (', ROUND(refund_rate, 2), '%)'), NULL),
      IF(cancelled_orders > 15, CONCAT('取消订单偏多 (', cancelled_orders, '笔)'), NULL)
    ) AS reasonText
  FROM calculated
  ORDER BY store_id, date
`;

export const COMPARE_SUMMARY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  sales AS (
    SELECT
      daily.store_id,
      SUM(daily.actual_sales) AS total_sales,
      SUM(daily.order_count) AS total_orders
    FROM store_sales_daily AS daily
    JOIN requested_stores AS requested ON requested.store_id = daily.store_id
    CROSS JOIN requested_range AS date_range
    WHERE daily.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY daily.store_id
  ),
  targets AS (
    SELECT target.store_id, SUM(target.sales_target) AS total_target
    FROM sales_target_daily AS target
    JOIN requested_stores AS requested ON requested.store_id = target.store_id
    CROSS JOIN requested_range AS date_range
    WHERE target.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY target.store_id
  ),
  refunds AS (
    SELECT
      refund.store_id,
      SUM(refund.refund_amount) AS total_refund,
      SUM(refund.cancelled_orders) AS total_cancelled
    FROM refund_cancel_daily AS refund
    JOIN requested_stores AS requested ON requested.store_id = refund.store_id
    CROSS JOIN requested_range AS date_range
    WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY refund.store_id
  )
  SELECT
    stores.store_id AS storeId,
    stores.store_name AS storeName,
    COALESCE(sales.total_sales, 0) AS totalSales,
    COALESCE(targets.total_target, 0) AS totalTarget,
    CASE
      WHEN COALESCE(targets.total_target, 0) > 0
      THEN ROUND(COALESCE(sales.total_sales, 0) / targets.total_target * 100, 1)
      ELSE 0
    END AS achievementRate,
    COALESCE(sales.total_orders, 0) AS totalOrders,
    CASE
      WHEN COALESCE(sales.total_orders, 0) > 0
      THEN ROUND(sales.total_sales / sales.total_orders)
      ELSE 0
    END AS avgOrderValue,
    COALESCE(refunds.total_refund, 0) AS totalRefund,
    COALESCE(refunds.total_cancelled, 0) AS totalCancelled,
    CASE
      WHEN COALESCE(sales.total_sales, 0) > 0
      THEN ROUND(COALESCE(refunds.total_refund, 0) / sales.total_sales * 100, 2)
      ELSE 0
    END AS refundRate
  FROM requested_stores AS requested
  JOIN store_master AS stores ON stores.store_id = requested.store_id
  LEFT JOIN sales ON sales.store_id = requested.store_id
  LEFT JOIN targets ON targets.store_id = requested.store_id
  LEFT JOIN refunds ON refunds.store_id = requested.store_id
  ORDER BY totalSales DESC
`;

export const COMPARE_DAILY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    sales.store_id AS storeId,
    DATE_FORMAT(sales.date, '%Y-%m-%d') AS date,
    SUM(sales.actual_sales) AS actualSales,
    COALESCE(SUM(targets.sales_target), 0) AS salesTarget
  FROM store_sales_daily AS sales
  JOIN requested_stores AS requested ON requested.store_id = sales.store_id
  CROSS JOIN requested_range AS date_range
  LEFT JOIN sales_target_daily AS targets
    ON targets.store_id = sales.store_id AND targets.date = sales.date
  WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY sales.store_id, sales.date
  ORDER BY sales.store_id, sales.date
`;

export const COMPARE_BREAKDOWN_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT 'channel' AS dimensionType, data.store_id AS storeId,
         data.channel AS dimensionName, SUM(data.sales_amount) AS value
  FROM sales_by_channel AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.store_id, data.channel
  UNION ALL
  SELECT 'category', data.store_id, data.category, SUM(data.sales_amount)
  FROM sales_by_category AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.store_id, data.category
  UNION ALL
  SELECT 'daypart', data.store_id, data.daypart, SUM(data.sales_amount)
  FROM sales_by_daypart AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.store_id, data.daypart
  ORDER BY storeId, dimensionType, value DESC
`;

export const COMPARE_FEEDBACK_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    DATE_FORMAT(feedback.date, '%Y-%m-%d') AS date,
    feedback.store_id AS storeId,
    feedback.feedback_type AS feedbackType,
    feedback.feedback_detail AS feedbackDetail,
    COALESCE(feedback.affected_daypart, '') AS affectedDaypart,
    COALESCE(feedback.affected_channel, '') AS affectedChannel
  FROM store_manager_feedback AS feedback
  JOIN requested_stores AS requested ON requested.store_id = feedback.store_id
  CROSS JOIN requested_range AS date_range
  WHERE feedback.date BETWEEN date_range.start_date AND date_range.end_date
  ORDER BY feedback.date, feedback.store_id
`;

export const ATTRIBUTION_SUMMARY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  period_sales AS (
    SELECT
      COALESCE(SUM(sales.actual_sales), 0) AS total_sales,
      COALESCE(SUM(sales.order_count), 0) AS total_orders
    FROM store_sales_daily AS sales
    JOIN requested_stores AS requested ON requested.store_id = sales.store_id
    CROSS JOIN requested_range AS date_range
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  period_targets AS (
    SELECT
      COALESCE(SUM(target.sales_target), 0) AS total_target,
      COALESCE(SUM(target.order_target), 0) AS total_order_target
    FROM sales_target_daily AS target
    JOIN requested_stores AS requested ON requested.store_id = target.store_id
    CROSS JOIN requested_range AS date_range
    WHERE target.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  historical_daily AS (
    SELECT
      sales.date,
      SUM(sales.actual_sales) AS daily_sales,
      SUM(sales.order_count) AS daily_orders
    FROM store_sales_daily AS sales
    JOIN requested_stores AS requested ON requested.store_id = sales.store_id
    GROUP BY sales.date
  ),
  historical AS (
    SELECT
      COALESCE(AVG(daily_sales), 0) AS avg_daily_sales,
      COALESCE(AVG(daily_orders), 0) AS avg_daily_orders,
      COALESCE(SUM(daily_sales) / NULLIF(SUM(daily_orders), 0), 0) AS avg_aov
    FROM historical_daily
  ),
  period_refunds AS (
    SELECT
      COALESCE(SUM(refund.refund_amount), 0) AS total_refund,
      COALESCE(SUM(refund.cancelled_orders), 0) AS total_cancelled
    FROM refund_cancel_daily AS refund
    JOIN requested_stores AS requested ON requested.store_id = refund.store_id
    CROSS JOIN requested_range AS date_range
    WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  calculated AS (
    SELECT
      period_sales.total_sales,
      period_sales.total_orders,
      period_targets.total_target,
      period_targets.total_order_target,
      period_refunds.total_refund,
      period_refunds.total_cancelled,
      historical.avg_daily_sales,
      historical.avg_daily_orders,
      historical.avg_aov,
      period_sales.total_sales /
        GREATEST(DATEDIFF(date_range.end_date, date_range.start_date) + 1, 1)
        AS actual_daily_sales,
      period_sales.total_orders /
        GREATEST(DATEDIFF(date_range.end_date, date_range.start_date) + 1, 1)
        AS actual_daily_orders,
      CASE
        WHEN period_sales.total_orders > 0
        THEN period_sales.total_sales / period_sales.total_orders
        ELSE 0
      END AS actual_aov
    FROM period_sales
    CROSS JOIN period_targets
    CROSS JOIN historical
    CROSS JOIN period_refunds
    CROSS JOIN requested_range AS date_range
  ),
  drops AS (
    SELECT
      calculated.*,
      avg_daily_sales - actual_daily_sales AS sales_drop,
      avg_daily_orders - actual_daily_orders AS orders_drop,
      avg_aov - actual_aov AS aov_drop
    FROM calculated
  )
  SELECT
    total_sales AS totalSales,
    total_target AS totalTarget,
    total_order_target AS totalOrderTarget,
    CASE WHEN total_target > 0 THEN total_sales / total_target * 100 ELSE 0 END
      AS achievementRate,
    total_orders AS totalOrders,
    actual_aov AS avgOrderValue,
    avg_daily_sales AS avgDailySales,
    avg_daily_orders AS avgDailyOrders,
    avg_aov AS historicalAOV,
    actual_daily_sales AS actualDailySales,
    actual_daily_orders AS actualDailyOrders,
    sales_drop AS salesDrop,
    orders_drop AS ordersDrop,
    aov_drop AS aovDrop,
    CASE
      WHEN orders_drop > 1 AND aov_drop > 1 THEN 'both'
      WHEN orders_drop > 1 AND ABS(orders_drop) >= ABS(aov_drop) THEN 'orders'
      WHEN aov_drop > 1 THEN 'aov'
      ELSE 'none'
    END AS mainIssue,
    total_refund AS totalRefund,
    total_cancelled AS totalCancelled,
    CASE WHEN total_sales > 0 THEN total_refund / total_sales * 100 ELSE 0 END
      AS refundRate
  FROM drops
`;

export const ATTRIBUTION_STORES_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    stores.store_id AS storeId,
    stores.store_name AS storeName,
    stores.store_type AS storeType
  FROM requested_stores AS requested
  JOIN store_master AS stores ON stores.store_id = requested.store_id
  CROSS JOIN requested_range
  ORDER BY stores.store_id
`;

export const ATTRIBUTION_DAILY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    DATE_FORMAT(sales.date, '%Y-%m-%d') AS date,
    SUM(sales.actual_sales) AS actualSales,
    COALESCE(SUM(targets.sales_target), 0) AS salesTarget,
    CASE
      WHEN COALESCE(SUM(targets.sales_target), 0) > 0
      THEN SUM(sales.actual_sales) / SUM(targets.sales_target) * 100
      ELSE 0
    END AS achievementRate,
    SUM(sales.order_count) AS orderCount,
    CASE
      WHEN SUM(sales.order_count) > 0
      THEN SUM(sales.actual_sales) / SUM(sales.order_count)
      ELSE 0
    END AS avgOrderValue
  FROM store_sales_daily AS sales
  JOIN requested_stores AS requested ON requested.store_id = sales.store_id
  CROSS JOIN requested_range AS date_range
  LEFT JOIN sales_target_daily AS targets
    ON targets.store_id = sales.store_id AND targets.date = sales.date
  WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY sales.date
  ORDER BY sales.date
`;

export const ATTRIBUTION_BREAKDOWN_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT 'channel' AS dimensionType, data.channel AS dimensionName,
         SUM(data.sales_amount) AS value
  FROM sales_by_channel AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.channel
  UNION ALL
  SELECT 'category', data.category, SUM(data.sales_amount)
  FROM sales_by_category AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.category
  UNION ALL
  SELECT 'daypart', data.daypart, SUM(data.sales_amount)
  FROM sales_by_daypart AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.daypart
  ORDER BY dimensionType, value DESC
`;

export const ATTRIBUTION_CHANNEL_DAILY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    DATE_FORMAT(data.date, '%Y-%m-%d') AS date,
    data.channel,
    SUM(data.sales_amount) AS salesAmount,
    SUM(data.order_count) AS orderCount
  FROM sales_by_channel AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.date, data.channel
  ORDER BY data.date, data.channel
`;

export const ATTRIBUTION_REFUND_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  sales AS (
    SELECT store_id, date, SUM(actual_sales) AS sales_amount
    FROM store_sales_daily
    GROUP BY store_id, date
  ),
  base AS (
    SELECT
      refund.store_id,
      stores.store_name,
      refund.date,
      SUM(refund.refund_amount) AS refund_amount,
      SUM(refund.cancelled_orders) AS cancelled_orders,
      COALESCE(SUM(sales.sales_amount), 0) AS sales_amount
    FROM refund_cancel_daily AS refund
    JOIN requested_stores AS requested ON requested.store_id = refund.store_id
    JOIN store_master AS stores ON stores.store_id = refund.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales ON sales.store_id = refund.store_id AND sales.date = refund.date
    WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY refund.store_id, stores.store_name, refund.date
  )
  SELECT
    'daily' AS scopeType,
    DATE_FORMAT(date, '%Y-%m-%d') AS date,
    NULL AS storeId,
    NULL AS storeName,
    SUM(refund_amount) AS refundAmount,
    SUM(cancelled_orders) AS cancelledOrders,
    CASE WHEN SUM(sales_amount) > 0 THEN SUM(refund_amount) / SUM(sales_amount) * 100 ELSE 0 END
      AS refundRate
  FROM base
  GROUP BY date
  UNION ALL
  SELECT
    'store',
    NULL,
    store_id,
    store_name,
    SUM(refund_amount),
    SUM(cancelled_orders),
    CASE WHEN SUM(sales_amount) > 0 THEN SUM(refund_amount) / SUM(sales_amount) * 100 ELSE 0 END
  FROM base
  GROUP BY store_id, store_name
  ORDER BY scopeType, refundAmount DESC, date
`;

export const ATTRIBUTION_FEEDBACK_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    DATE_FORMAT(feedback.date, '%Y-%m-%d') AS date,
    feedback.store_id,
    feedback.feedback_type,
    feedback.feedback_detail,
    COALESCE(feedback.manager_name, '') AS manager_name,
    COALESCE(feedback.affected_daypart, '') AS affected_daypart,
    COALESCE(feedback.affected_channel, '') AS affected_channel
  FROM store_manager_feedback AS feedback
  JOIN requested_stores AS requested ON requested.store_id = feedback.store_id
  CROSS JOIN requested_range AS date_range
  WHERE feedback.date BETWEEN date_range.start_date AND date_range.end_date
  ORDER BY feedback.date, feedback.store_id
`;

export const ATTRIBUTION_BENCHMARK_AGG_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  promo_totals AS (
    SELECT
      COALESCE(SUM(promotions.promo_sales), 0) AS promo_sales,
      COALESCE(SUM(promotions.promo_orders), 0) AS promo_orders
    FROM promotion_daily AS promotions
    JOIN requested_stores AS requested ON requested.store_id = promotions.store_id
    CROSS JOIN requested_range AS date_range
    WHERE promotions.date BETWEEN date_range.start_date AND date_range.end_date
  )
  SELECT
    COALESCE(SUM(sales.actual_sales), 0) AS total_sales,
    COALESCE(SUM(sales.order_count), 0) AS total_orders,
    COALESCE(SUM(sales.customer_count), 0) AS total_customers,
    COALESCE(SUM(sales.refund_amount), 0) AS total_refund,
    COALESCE(SUM(sales.cancelled_orders), 0) AS total_cancelled,
    COALESCE((SELECT promo_sales FROM promo_totals), 0) AS total_promo_sales,
    COALESCE((SELECT promo_orders FROM promo_totals), 0) AS total_promo_orders
  FROM store_sales_daily AS sales
  JOIN requested_stores AS requested ON requested.store_id = sales.store_id
  CROSS JOIN requested_range AS date_range
  WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
`;

export const ATTRIBUTION_BENCHMARK_BREAKDOWN_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT 'channel' AS dimensionType, data.channel AS dimensionName,
         SUM(data.sales_amount) AS value
  FROM sales_by_channel AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.channel
  UNION ALL
  SELECT 'daypart' AS dimensionType, data.daypart AS dimensionName,
         SUM(data.sales_amount) AS value
  FROM sales_by_daypart AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.daypart
  UNION ALL
  SELECT 'category' AS dimensionType, data.category AS dimensionName,
         SUM(data.sales_amount) AS value
  FROM sales_by_category AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY data.category
`;

export const ATTRIBUTION_REFUND_REASONS_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    COALESCE(NULLIF(TRIM(refund.main_reason), ''), '其他') AS reason,
    COALESCE(SUM(refund.refund_amount), 0) AS amount,
    COALESCE(SUM(refund.refund_orders), 0) AS orders
  FROM refund_cancel_daily AS refund
  JOIN requested_stores AS requested ON requested.store_id = refund.store_id
  CROSS JOIN requested_range AS date_range
  WHERE refund.date BETWEEN date_range.start_date AND date_range.end_date
  GROUP BY reason
  ORDER BY amount DESC
`;

export const ATTRIBUTION_CATEGORY_ITEMS_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  )
  SELECT
    COALESCE(SUM(data.order_count), 0) AS order_count,
    COALESCE(SUM(data.item_count), 0) AS item_count
  FROM sales_by_category AS data
  JOIN requested_stores AS requested ON requested.store_id = data.store_id
  CROSS JOIN requested_range AS date_range
  WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
`;

export const ATTRIBUTION_PROMOTION_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  promotions AS (
    SELECT
      data.promotion_name,
      SUM(data.promo_sales) AS promo_sales,
      SUM(data.promo_orders) AS promo_orders
    FROM promotion_daily AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY data.promotion_name
  ),
  ranked AS (
    SELECT promotions.*, ROW_NUMBER() OVER (ORDER BY promo_sales DESC) AS sales_rank
    FROM promotions
  )
  SELECT
    promotion_name,
    promo_sales,
    promo_orders,
    SUM(promo_sales) OVER () AS totalDiscount,
    SUM(promo_orders) OVER () AS totalPromoUnits,
    COUNT(*) OVER () AS promoCount,
    sales_rank AS salesRank
  FROM ranked
  ORDER BY sales_rank
`;

export const REPORT_SUMMARY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  sales AS (
    SELECT COALESCE(SUM(data.actual_sales), 0) AS total_sales,
           COALESCE(SUM(data.order_count), 0) AS total_orders
    FROM store_sales_daily AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  targets AS (
    SELECT COALESCE(SUM(data.sales_target), 0) AS total_target
    FROM sales_target_daily AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  refunds AS (
    SELECT COALESCE(SUM(data.refund_amount), 0) AS total_refund,
           COALESCE(SUM(data.cancelled_orders), 0) AS total_cancelled
    FROM refund_cancel_daily AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  ),
  promotions AS (
    SELECT COALESCE(SUM(data.promo_sales), 0) AS total_promo
    FROM promotion_daily AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
  )
  SELECT
    (SELECT COUNT(*) FROM requested_stores) AS storeCount,
    sales.total_sales AS totalSales,
    targets.total_target AS totalTarget,
    CASE WHEN targets.total_target > 0 THEN sales.total_sales / targets.total_target * 100 ELSE 0 END
      AS achievementRate,
    sales.total_orders AS totalOrders,
    CASE WHEN sales.total_orders > 0 THEN sales.total_sales / sales.total_orders ELSE 0 END
      AS avgAOV,
    refunds.total_refund AS totalRefund,
    CASE WHEN sales.total_sales > 0 THEN refunds.total_refund / sales.total_sales * 100 ELSE 0 END
      AS refundRate,
    refunds.total_cancelled AS totalCancelled,
    promotions.total_promo AS totalPromo,
    CASE WHEN sales.total_sales > 0 THEN promotions.total_promo / sales.total_sales * 100 ELSE 0 END
      AS promoRate
  FROM sales
  CROSS JOIN targets
  CROSS JOIN refunds
  CROSS JOIN promotions
`;

export const REPORT_STORE_RANKING_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  sales AS (
    SELECT store_id, SUM(actual_sales) AS total_sales, SUM(order_count) AS total_orders
    FROM store_sales_daily
    CROSS JOIN requested_range AS date_range
    WHERE date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY store_id
  ),
  targets AS (
    SELECT store_id, SUM(sales_target) AS total_target
    FROM sales_target_daily
    CROSS JOIN requested_range AS date_range
    WHERE date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY store_id
  )
  SELECT
    stores.store_id AS storeId,
    stores.store_name AS storeName,
    COALESCE(sales.total_sales, 0) AS totalSales,
    COALESCE(targets.total_target, 0) AS totalTarget,
    CASE
      WHEN COALESCE(targets.total_target, 0) > 0
      THEN sales.total_sales / targets.total_target * 100
      ELSE 0
    END AS achievementRate,
    ROW_NUMBER() OVER (ORDER BY COALESCE(sales.total_sales, 0) DESC) AS salesRank
  FROM requested_stores AS requested
  JOIN store_master AS stores ON stores.store_id = requested.store_id
  LEFT JOIN sales ON sales.store_id = requested.store_id
  LEFT JOIN targets ON targets.store_id = requested.store_id
  ORDER BY salesRank
`;

export const REPORT_DAILY_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  daily AS (
    SELECT
      sales.date,
      SUM(sales.actual_sales) AS sales,
      SUM(sales.order_count) AS orders,
      COALESCE(SUM(targets.sales_target), 0) AS target
    FROM store_sales_daily AS sales
    JOIN requested_stores AS requested ON requested.store_id = sales.store_id
    CROSS JOIN requested_range AS date_range
    LEFT JOIN sales_target_daily AS targets
      ON targets.store_id = sales.store_id AND targets.date = sales.date
    WHERE sales.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY sales.date
  ),
  calculated AS (
    SELECT
      daily.*,
      ROW_NUMBER() OVER (ORDER BY sales DESC) AS sales_rank_desc,
      ROW_NUMBER() OVER (ORDER BY sales ASC) AS sales_rank_asc,
      AVG(sales) OVER () AS mean_sales,
      AVG(CASE WHEN DAYOFWEEK(date) IN (1, 7) THEN sales END) OVER () AS weekend_avg,
      AVG(CASE WHEN DAYOFWEEK(date) NOT IN (1, 7) THEN sales END) OVER () AS weekday_avg
    FROM daily
  )
  SELECT
    DATE_FORMAT(date, '%Y-%m-%d') AS date,
    sales,
    target,
    orders,
    CASE WHEN orders > 0 THEN sales / orders ELSE 0 END AS avgAOV,
    sales_rank_desc AS salesRankDesc,
    sales_rank_asc AS salesRankAsc,
    CASE WHEN ABS(sales - mean_sales) > mean_sales * 0.2 THEN 1 ELSE 0 END AS isAnomaly,
    COALESCE(weekend_avg, 0) AS weekendAvg,
    COALESCE(weekday_avg, 0) AS weekdayAvg,
    CASE
      WHEN COALESCE(weekday_avg, 0) > 0
      THEN (weekend_avg / weekday_avg - 1) * 100
      ELSE 0
    END AS weekendVs
  FROM calculated
  ORDER BY date
`;

export const REPORT_BREAKDOWN_SQL = `
  WITH requested_stores AS (
    SELECT store_id
    FROM JSON_TABLE(?, '$[*]' COLUMNS(store_id VARCHAR(16) PATH '$')) AS scope
  ),
  requested_range AS (
    SELECT CAST(? AS DATE) AS start_date, CAST(? AS DATE) AS end_date
  ),
  breakdown AS (
    SELECT 'channel' AS dimension_type, data.channel AS dimension_name,
           SUM(data.sales_amount) AS value
    FROM sales_by_channel AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY data.channel
    UNION ALL
    SELECT 'category', data.category, SUM(data.sales_amount)
    FROM sales_by_category AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY data.category
    UNION ALL
    SELECT 'daypart', data.daypart, SUM(data.sales_amount)
    FROM sales_by_daypart AS data
    JOIN requested_stores AS requested ON requested.store_id = data.store_id
    CROSS JOIN requested_range AS date_range
    WHERE data.date BETWEEN date_range.start_date AND date_range.end_date
    GROUP BY data.daypart
  )
  SELECT
    dimension_type AS dimensionType,
    dimension_name AS dimensionName,
    value,
    CASE
      WHEN SUM(value) OVER (PARTITION BY dimension_type) > 0
      THEN value / SUM(value) OVER (PARTITION BY dimension_type) * 100
      ELSE 0
    END AS pct
  FROM breakdown
  ORDER BY dimensionType, value DESC
`;
