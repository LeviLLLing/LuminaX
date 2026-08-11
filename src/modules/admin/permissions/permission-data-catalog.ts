export const PERMISSION_DATA_CATALOG = [
  {
    name: "store_sales_daily",
    label: "门店日销售",
    columns: [
      "date",
      "store_id",
      "actual_sales",
      "order_count",
      "customer_count",
      "avg_order_value",
      "refund_amount",
      "cancelled_orders",
    ],
  },
  {
    name: "sales_target_daily",
    label: "门店日目标",
    columns: [
      "date",
      "store_id",
      "sales_target",
      "order_target",
      "aov_target",
    ],
  },
  {
    name: "sales_by_channel",
    label: "渠道销售",
    columns: ["date", "store_id", "channel", "sales_amount", "order_count"],
  },
  {
    name: "sales_by_daypart",
    label: "时段销售",
    columns: ["date", "store_id", "daypart", "sales_amount", "order_count"],
  },
  {
    name: "sales_by_category",
    label: "品类销售",
    columns: ["date", "store_id", "category", "sales_amount", "order_count"],
  },
  {
    name: "promotion_daily",
    label: "促销表现",
    columns: [
      "date",
      "store_id",
      "promotion_id",
      "promotion_name",
      "product_scope",
      "promo_sales",
      "promo_orders",
      "coupon_used",
    ],
  },
  {
    name: "refund_cancel_daily",
    label: "退款与取消",
    columns: [
      "date",
      "store_id",
      "refund_amount",
      "refund_orders",
      "cancelled_orders",
      "main_reason",
    ],
  },
  {
    name: "store_manager_feedback",
    label: "店长反馈",
    columns: [
      "date",
      "store_id",
      "feedback_type",
      "feedback_detail",
      "affected_daypart",
      "affected_channel",
      "manager_name",
    ],
  },
  {
    name: "store_master",
    label: "门店主数据",
    columns: [
      "store_id",
      "store_name",
      "region",
      "city",
      "store_type",
      "opening_date",
      "area_type",
    ],
  },
  {
    name: "store_sales_attribution_dataset",
    label: "销售归因数据集",
    columns: [
      "date",
      "store_id",
      "store_name",
      "actual_sales",
      "sales_target",
      "achievement_rate",
      "order_count",
      "avg_order_value",
      "top_channel",
      "weak_daypart",
      "top_category",
      "promo_sales",
      "refund_amount",
      "manager_feedback",
    ],
  },
] as const;

export type PermissionTableName =
  (typeof PERMISSION_DATA_CATALOG)[number]["name"];

export const PERMISSION_STORES = [
  { id: "S001", name: "上海商场店" },
  { id: "S002", name: "办公园区店" },
  { id: "S003", name: "大学城店" },
  { id: "S004", name: "地铁站店" },
  { id: "S005", name: "社区中心店" },
] as const;

const tableMap = new Map(
  PERMISSION_DATA_CATALOG.map((table) => [table.name, table])
);

export function findPermissionTable(tableName: string) {
  return tableMap.get(tableName as PermissionTableName);
}

export function isPermissionTableName(
  tableName: string
): tableName is PermissionTableName {
  return tableMap.has(tableName as PermissionTableName);
}

export function isPermissionStoreId(storeId: string): boolean {
  return PERMISSION_STORES.some((store) => store.id === storeId);
}

