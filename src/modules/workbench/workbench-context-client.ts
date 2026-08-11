import { z } from "zod";
import type { WorkbenchContext } from "./workbench-types";

const intentSchema = z.enum([
  "achievement_rate",
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "promotion_contribution",
  "refund_rate",
  "anomaly_detection",
  "compare",
  "attribution",
  "report",
  "custom_metric",
]);

const workbenchContextPayloadSchema = z
  .object({
    templateId: z.string(),
    availableStoreIds: z.array(z.string().min(1)),
    availableMetricCodes: z.array(z.string().min(1)),
    availableIntents: z.array(intentSchema),
    canAccessAdmin: z.boolean(),
  })
  .strict();

export class WorkbenchContextClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkbenchContextClientError";
  }
}

export function normalizeWorkbenchContext(payload: unknown): WorkbenchContext {
  const result = workbenchContextPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new WorkbenchContextClientError("工作台权限上下文无效", 500);
  }
  return {
    templateId:
      result.data.templateId === "regional_manager"
        ? "regional_manager"
        : "default",
    availableStoreIds: unique(result.data.availableStoreIds),
    availableMetricCodes: unique(result.data.availableMetricCodes),
    availableIntents: unique(result.data.availableIntents),
    canAccessAdmin: result.data.canAccessAdmin,
  };
}

export async function fetchWorkbenchContext(
  signal?: AbortSignal
): Promise<WorkbenchContext> {
  const response = await fetch("/api/workbench/context", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new WorkbenchContextClientError(
      response.status === 403 ? "当前账号没有工作台访问权限" : "工作台暂时不可用",
      response.status
    );
  }
  return normalizeWorkbenchContext(await response.json());
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
