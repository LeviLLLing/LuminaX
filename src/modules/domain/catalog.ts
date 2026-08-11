export const CHANNEL_MAP: Record<string, string> = {
  "Dine-in": "堂食",
  Takeaway: "外带",
  Delivery: "外卖",
};

export const DAYPART_MAP: Record<string, string> = {
  Breakfast: "早餐",
  Lunch: "午餐",
  "Afternoon Tea": "下午茶",
  Dinner: "晚餐",
};

export const CATEGORY_MAP: Record<string, string> = {
  Burger: "汉堡",
  "Fried Chicken": "炸鸡",
  Beverage: "饮料",
  "Combo Meal": "套餐",
  Snack: "小食",
};

export const STORES: Record<
  string,
  { name: string; type: string; area: string }
> = {
  S001: {
    name: "上海商场店",
    type: "Mall Store",
    area: "Shopping Mall",
  },
  S002: {
    name: "办公园区店",
    type: "Office Store",
    area: "Office Area",
  },
  S003: {
    name: "大学城店",
    type: "Street Store",
    area: "School Area",
  },
  S004: {
    name: "地铁站店",
    type: "Transit Store",
    area: "Transport Hub",
  },
  S005: {
    name: "社区中心店",
    type: "Community Store",
    area: "Residential Area",
  },
};
