-- LuminaX MySQL schema (PoC sample data)
-- Requires MySQL 8.0+ (fixed metric SQL uses JSON_TABLE)
-- Run this file first, then seed.sql

CREATE DATABASE IF NOT EXISTS luminax
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE luminax;

CREATE TABLE IF NOT EXISTS store_master (
  store_id     VARCHAR(16)  NOT NULL,
  store_name   VARCHAR(100) NOT NULL,
  region       VARCHAR(50)  NOT NULL,
  city         VARCHAR(50)  NOT NULL,
  store_type   VARCHAR(50)  NOT NULL,
  opening_date DATE         NOT NULL,
  area_type    VARCHAR(50)  NOT NULL,
  PRIMARY KEY (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS store_sales_daily (
  date            DATE         NOT NULL,
  store_id        VARCHAR(16)  NOT NULL,
  actual_sales    DECIMAL(14,2) NOT NULL,
  order_count     INT          NOT NULL,
  customer_count  INT          NOT NULL,
  avg_order_value DECIMAL(10,2) NOT NULL,
  refund_amount   DECIMAL(14,2) NOT NULL,
  cancelled_orders INT         NOT NULL,
  PRIMARY KEY (store_id, date),
  KEY idx_sales_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sales_target_daily (
  date         DATE          NOT NULL,
  store_id     VARCHAR(16)   NOT NULL,
  sales_target DECIMAL(14,2) NOT NULL,
  order_target INT           NOT NULL,
  aov_target   DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (store_id, date),
  KEY idx_target_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sales_by_channel (
  date         DATE          NOT NULL,
  store_id     VARCHAR(16)   NOT NULL,
  channel      VARCHAR(50)   NOT NULL,
  sales_amount DECIMAL(14,2) NOT NULL,
  order_count  INT           NOT NULL,
  PRIMARY KEY (store_id, date, channel),
  KEY idx_channel_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sales_by_daypart (
  date            DATE          NOT NULL,
  store_id        VARCHAR(16)   NOT NULL,
  daypart         VARCHAR(50)   NOT NULL,
  sales_amount    DECIMAL(14,2) NOT NULL,
  order_count     INT           NOT NULL,
  avg_order_value DECIMAL(10,2) NULL,
  PRIMARY KEY (store_id, date, daypart),
  KEY idx_daypart_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sales_by_category (
  date         DATE          NOT NULL,
  store_id     VARCHAR(16)   NOT NULL,
  category     VARCHAR(50)   NOT NULL,
  sales_amount DECIMAL(14,2) NOT NULL,
  order_count  INT           NOT NULL,
  item_count   INT           NULL,
  PRIMARY KEY (store_id, date, category),
  KEY idx_category_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS promotion_daily (
  date           DATE          NOT NULL,
  store_id       VARCHAR(16)   NOT NULL,
  promotion_id   VARCHAR(16)   NOT NULL,
  promotion_name VARCHAR(100)  NOT NULL,
  product_scope  VARCHAR(100)  NULL,
  promo_sales    DECIMAL(14,2) NOT NULL,
  promo_orders   INT           NOT NULL,
  coupon_used    INT           NULL,
  PRIMARY KEY (store_id, date, promotion_id),
  KEY idx_promotion_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS refund_cancel_daily (
  date            DATE          NOT NULL,
  store_id        VARCHAR(16)   NOT NULL,
  refund_amount   DECIMAL(14,2) NOT NULL,
  refund_orders   INT           NULL,
  cancelled_orders INT          NOT NULL,
  main_reason     VARCHAR(255)  NULL,
  PRIMARY KEY (store_id, date),
  KEY idx_refund_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS store_manager_feedback (
  date              DATE         NOT NULL,
  store_id          VARCHAR(16)  NOT NULL,
  feedback_type     VARCHAR(50)  NOT NULL,
  feedback_detail   TEXT         NOT NULL,
  affected_daypart  VARCHAR(50)  NOT NULL,
  affected_channel  VARCHAR(50)  NOT NULL,
  manager_name      VARCHAR(100) NOT NULL,
  PRIMARY KEY (store_id, date),
  KEY idx_feedback_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS store_sales_attribution_dataset (
  date              DATE          NOT NULL,
  store_id          VARCHAR(16)   NOT NULL,
  store_name        VARCHAR(100)  NOT NULL,
  actual_sales      DECIMAL(14,2) NOT NULL,
  sales_target      DECIMAL(14,2) NOT NULL,
  achievement_rate  DECIMAL(10,6) NOT NULL,
  order_count       INT           NOT NULL,
  avg_order_value   DECIMAL(10,2) NOT NULL,
  top_channel       VARCHAR(50)   NOT NULL,
  weak_daypart      VARCHAR(50)   NOT NULL,
  top_category      VARCHAR(50)   NOT NULL,
  promo_sales       DECIMAL(14,2) NOT NULL,
  refund_amount     DECIMAL(14,2) NOT NULL,
  manager_feedback  TEXT          NULL,
  PRIMARY KEY (store_id, date),
  KEY idx_attribution_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
