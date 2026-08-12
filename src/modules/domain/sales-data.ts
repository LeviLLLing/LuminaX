export interface StoreMaster {
  store_id: string;
  store_name: string;
  region: string;
  city: string;
  store_type: string;
  opening_date: string;
  area_type: string;
}

export interface StoreSalesDaily {
  date: string;
  store_id: string;
  actual_sales: number;
  order_count: number;
  customer_count: number;
  avg_order_value: number;
  refund_amount: number;
  cancelled_orders: number;
}

export interface SalesTargetDaily {
  date: string;
  store_id: string;
  sales_target: number;
  order_target: number;
  aov_target: number;
}

export interface SalesByChannel {
  date: string;
  store_id: string;
  channel: string;
  sales_amount: number;
  order_count: number;
}

export interface SalesByDaypart {
  date: string;
  store_id: string;
  daypart: string;
  sales_amount: number;
  order_count: number;
}

export interface SalesByCategory {
  date: string;
  store_id: string;
  category: string;
  sales_amount: number;
  order_count: number;
  item_count?: number;
}

export interface PromotionDaily {
  date: string;
  store_id: string;
  promotion_id?: string;
  promotion_name: string;
  product_scope?: string;
  promo_sales: number;
  promo_orders: number;
  coupon_used?: number;
  discount_amount?: number;
  promo_units?: number;
}

export interface RefundCancelDaily {
  date: string;
  store_id: string;
  refund_amount: number;
  refund_orders?: number;
  refund_rate?: number;
  cancelled_orders: number;
  main_reason?: string;
}

export interface StoreManagerFeedback {
  date: string;
  store_id: string;
  feedback_type: string;
  feedback_detail: string;
  affected_daypart: string;
  affected_channel: string;
  manager_name: string;
}

export interface AttributionDataset {
  date: string;
  store_id: string;
  store_name: string;
  actual_sales: number;
  sales_target: number;
  achievement_rate: number;
  order_count: number;
  avg_order_value: number;
  top_channel: string;
  weak_daypart: string;
  top_category: string;
  promo_sales: number;
  refund_amount: number;
  manager_feedback: string;
}

export interface SalesData {
  store_master: StoreMaster[];
  store_sales_daily: StoreSalesDaily[];
  sales_target_daily: SalesTargetDaily[];
  sales_by_channel: SalesByChannel[];
  sales_by_daypart: SalesByDaypart[];
  sales_by_category: SalesByCategory[];
  promotion_daily: PromotionDaily[];
  refund_cancel_daily: RefundCancelDaily[];
  store_manager_feedback: StoreManagerFeedback[];
  store_sales_attribution_dataset: AttributionDataset[];
}
