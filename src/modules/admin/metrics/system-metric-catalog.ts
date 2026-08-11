import type { SystemMetricDefinition } from "./metric-definition";

export const SYSTEM_METRIC_DEFINITIONS: readonly SystemMetricDefinition[] = [
  systemMetric("achievement_rate", "销售达成率", "实际销售额相对销售目标的完成比例", "sales", "percentage", ["store_sales_daily", "sales_target_daily"]),
  systemMetric("order_trend", "订单趋势", "订单量、目标完成度及前后半期趋势", "order", "count", ["store_sales_daily", "sales_target_daily"]),
  systemMetric("aov_trend", "客单价趋势", "销售额与订单量计算的客单价变化", "customer", "currency", ["store_sales_daily", "sales_target_daily"]),
  systemMetric("channel_mix", "渠道结构", "堂食、外带与外卖渠道销售构成", "channel", "percentage", ["sales_by_channel"]),
  systemMetric("daypart_analysis", "时段表现", "早餐、午餐、下午茶与晚餐销售构成", "operations", "percentage", ["sales_by_daypart"]),
  systemMetric("promotion_contribution", "促销贡献", "促销销售对整体销售的贡献比例", "promotion", "percentage", ["store_sales_daily", "promotion_daily"]),
  systemMetric("refund_rate", "退款率", "退款金额及取消订单相对销售表现的比例", "risk", "percentage", ["store_sales_daily", "refund_cancel_daily"]),
  systemMetric("anomaly_detection", "异常检测", "基于销售波动、目标与退款表现识别异常日期", "risk", "number", ["store_sales_daily", "sales_target_daily", "refund_cancel_daily"]),
  systemMetric("compare", "门店对比", "多门店销售、目标、订单和结构对比", "operations", "number", ["store_sales_daily", "sales_target_daily"]),
  systemMetric("attribution", "经营归因", "结合销售、订单、渠道、时段、退款与反馈开展归因", "operations", "number", ["store_sales_daily", "sales_target_daily", "store_manager_feedback"]),
  systemMetric("report", "经营周报", "经营指标汇总、门店排名、日趋势和结构分析", "operations", "number", ["store_sales_daily", "sales_target_daily"]),
];

function systemMetric(
  code: string,
  name: string,
  description: string,
  category: SystemMetricDefinition["category"],
  unit: SystemMetricDefinition["unit"],
  requestedTables: SystemMetricDefinition["requestedTables"]
): SystemMetricDefinition {
  return {
    id: `system:${code}`,
    code,
    name,
    description,
    aliases: [],
    category,
    unit,
    precision: 2,
    requestedTables,
    sqlTemplate: "",
    origin: "system",
    status: "system",
    validation: null,
    createdAt: null,
    updatedAt: null,
    publishedAt: null,
  };
}
