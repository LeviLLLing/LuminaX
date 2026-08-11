export const DEFAULT_START_DATE = "2025-05-01";
export const DEFAULT_END_DATE = "2025-05-14";

export const STORE_NAME_TO_ID: Record<string, string> = {
  上海商场店: "S001",
  办公园区店: "S002",
  大学城店: "S003",
  地铁站店: "S004",
  社区中心店: "S005",
};

export const STORE_DISPLAY_INFO: Record<string, { name: string; type: string }> = {
  S001: { name: "上海商场店", type: "Mall Store" },
  S002: { name: "办公园区店", type: "Office Store" },
  S003: { name: "大学城店", type: "Street Store" },
  S004: { name: "地铁站店", type: "Transit Store" },
  S005: { name: "社区中心店", type: "Community Store" },
};

export const CHANNEL_LABELS: Record<string, string> = {
  "Dine-in": "堂食",
  Takeaway: "外带",
  Delivery: "外卖",
};

export const CATEGORY_LABELS: Record<string, string> = {
  Burger: "汉堡",
  "Fried Chicken": "炸鸡",
  Beverage: "饮料",
  "Combo Meal": "套餐",
  Snack: "小食",
  Drinks: "饮料",
};

export const DAYPART_LABELS: Record<string, string> = {
  Breakfast: "早餐",
  Lunch: "午餐",
  "Afternoon Tea": "下午茶",
  Dinner: "晚餐",
};

export const DOMAIN_KEYWORDS = [
  "门店", "销售", "业绩", "营收", "目标", "达标", "订单", "客单价",
  "渠道", "堂食", "外带", "外卖", "时段", "早餐", "午餐", "下午茶", "晚餐",
  "品类", "汉堡", "炸鸡", "饮料", "套餐", "小食", "促销", "退款", "取消",
  "归因", "原因", "为什么", "分析", "对比", "比较", "差异", "趋势", "走势",
  "变化", "周报", "报告", "排名", "增长", "下降", "异常", "波动",
];

export const OUT_OF_SCOPE_KEYWORDS = [
  "华东2区", "华东3区", "华南", "华北", "西南", "华中", "东北", "西北",
  "成都", "北京", "广州", "深圳", "杭州", "南京", "武汉", "重庆", "天津",
  "动物园", "王府井", "春熙路", "天府",
];

export const BRAND_YELLOW = "#FFE600";
export const BRAND_BLACK = "#1a1a1a";
export const CHART_PALETTE = ["#FFE600", "#c62828", "#2e7d32", "#1565c0", "#f57c00"];
