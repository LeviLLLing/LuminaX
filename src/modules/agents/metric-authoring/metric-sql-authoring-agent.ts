import { METRIC_SQL_AUTHORING_SYSTEM_PROMPT } from "@/modules/agents/prompts/metric-sql-authoring-system-prompt";
import type {
  AgentModel,
  AgentModelRequest,
} from "@/modules/agents/shared/agent-model";
import {
  extractJsonObject,
  serializePromptData,
} from "@/modules/agents/shared/prompt-utils";
import type { MetricDefinitionInput } from "@/modules/admin/metrics/metric-definition";

const DATABASE_SCHEMA = {
  store_sales_daily: [
    "date",
    "store_id",
    "actual_sales",
    "order_count",
    "customer_count",
    "avg_order_value",
    "refund_amount",
    "cancelled_orders",
  ],
  sales_target_daily: [
    "date",
    "store_id",
    "sales_target",
    "order_target",
    "aov_target",
  ],
  sales_by_channel: ["date", "store_id", "channel", "sales_amount", "order_count"],
  sales_by_daypart: ["date", "store_id", "daypart", "sales_amount", "order_count"],
  sales_by_category: ["date", "store_id", "category", "sales_amount", "order_count"],
  promotion_daily: [
    "date",
    "store_id",
    "promotion_id",
    "promotion_name",
    "product_scope",
    "promo_sales",
    "promo_orders",
    "coupon_used",
  ],
  refund_cancel_daily: [
    "date",
    "store_id",
    "refund_amount",
    "refund_orders",
    "cancelled_orders",
    "main_reason",
  ],
  store_manager_feedback: [
    "date",
    "store_id",
    "feedback_type",
    "feedback_detail",
    "affected_daypart",
    "affected_channel",
    "manager_name",
  ],
  store_master: [
    "store_id",
    "store_name",
    "region",
    "city",
    "store_type",
    "opening_date",
    "area_type",
  ],
  store_sales_attribution_dataset: [
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
} as const;

export interface GeneratedMetricSql {
  sqlTemplate: string;
  explanation: string;
  assumptions: string[];
}

export interface MetricSqlAuthoringAgent {
  generate(input: MetricDefinitionInput): Promise<GeneratedMetricSql>;
}

export interface MetricSqlAuthoringAgentOptions {
  maxAttempts?: number;
}

export class MetricSqlAuthoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricSqlAuthoringError";
  }
}

export function createMetricSqlAuthoringAgent(
  model: AgentModel,
  options: MetricSqlAuthoringAgentOptions = {}
): MetricSqlAuthoringAgent {
  const maxAttempts = Math.max(1, options.maxAttempts || 2);
  return {
    async generate(input) {
      const requestedSchema = Object.fromEntries(
        input.requestedTables.map((table) => [table, DATABASE_SCHEMA[table]])
      );
      const request: AgentModelRequest = {
        systemPrompt: METRIC_SQL_AUTHORING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              "## 指标定义",
              serializePromptData({
                code: input.code,
                name: input.name,
                description: input.description,
                unit: input.unit,
                precision: input.precision,
              }),
              "",
              "## 可用 Schema",
              serializePromptData(requestedSchema),
            ].join("\n"),
          },
        ],
        temperature: 0,
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await model.complete(request);
        const parsed = response ? extractJsonObject(response) : null;
        if (!parsed || typeof parsed.sqlTemplate !== "string") continue;
        return {
          sqlTemplate: parsed.sqlTemplate.trim(),
          explanation:
            typeof parsed.explanation === "string" ? parsed.explanation : "",
          assumptions: Array.isArray(parsed.assumptions)
            ? parsed.assumptions.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
        };
      }

      throw new MetricSqlAuthoringError(
        "SQL 编写 Agent 多次未返回有效结果。"
      );
    },
  };
}
