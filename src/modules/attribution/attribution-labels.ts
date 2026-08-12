import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  DAYPART_LABELS,
} from "@/modules/domain/constants";

export const REFUND_REASON_LABELS: Record<string, string> = {
  "Customer cancellation": "顾客取消",
  "Wrong item": "错品",
  "Delivery delay": "配送延迟",
  "Payment issue": "支付问题",
  "Out of stock": "缺货",
  "Product supply": "产品供应",
  "其他": "其他",
};

export const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  Staffing: "排班",
  "External Traffic": "外部客流",
  "Delivery Platform": "配送平台",
  "Product Supply": "产品供应",
  "Local Event": "本地事件",
  Weather: "天气",
};

export const FEEDBACK_DETAIL_LABELS: Record<string, string> = {
  "Lunch peak understaffed due to two sick leaves":
    "午市高峰因两名员工病假导致人手不足",
  "Nearby office building had a public holiday":
    "周边办公楼放假，外部客流减少",
  "Delivery platform ranking dropped in the afternoon":
    "下午外卖平台排名下滑",
  "Fried chicken stock was limited after 7pm":
    "晚 7 点后炸鸡备货不足",
  "Morning shift shortage impacted breakfast service":
    "早班人手不足影响早餐时段服务",
  "Nearby transit event increased evening traffic":
    "附近交通枢纽活动带动晚间客流",
  "Heavy rain reduced dine-in traffic but delivery stayed stable":
    "大雨导致堂食客流下降，外送保持稳定",
};

export const FACTOR_LABELS: Record<string, string> = {
  customer_count: "客流",
  attach_rate: "连带率",
  items_per_order: "每单件数",
  promo_penetration: "促销渗透率",
  promo_efficiency: "促销效率",
  cancel_rate: "取消率",
  maturity: "门店成熟度",
};

export function localizeRefundReason(reason: string): string {
  return REFUND_REASON_LABELS[reason] || reason;
}

export function localizeFeedbackType(type: string): string {
  return FEEDBACK_TYPE_LABELS[type] || type;
}

export function localizeFeedbackDetail(detail: string): string {
  return FEEDBACK_DETAIL_LABELS[detail] || detail;
}

export function localizeDimensionName(
  dimension: "channel" | "daypart" | "category",
  name: string
): string {
  if (dimension === "channel") return CHANNEL_LABELS[name] || name;
  if (dimension === "daypart") return DAYPART_LABELS[name] || name;
  return CATEGORY_LABELS[name] || name;
}

export function localizeFactorName(factor: string): string {
  if (FACTOR_LABELS[factor]) return FACTOR_LABELS[factor];
  if (factor.startsWith("refund_reason_")) {
    return `退款原因·${localizeRefundReason(
      factor.slice("refund_reason_".length)
    )}`;
  }
  const prefixes: Array<
    [prefix: string, dimension: "channel" | "daypart" | "category"]
  > = [
    ["channel_", "channel"],
    ["daypart_", "daypart"],
    ["category_", "category"],
  ];
  for (const [prefix, dimension] of prefixes) {
    if (factor.startsWith(prefix)) {
      const name = factor.slice(prefix.length);
      return `${DIMENSION_LABELS[dimension]}·${localizeDimensionName(
        dimension,
        name
      )}`;
    }
  }
  return factor;
}

const DIMENSION_LABELS: Record<"channel" | "daypart" | "category", string> = {
  channel: "渠道",
  daypart: "时段",
  category: "品类",
};
