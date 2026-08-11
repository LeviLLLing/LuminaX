import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdminRequest } from "@/modules/admin/admin-request-auth";
import {
  MetricAdminError,
} from "@/modules/admin/metrics/metric-admin-application";
import { metricAdminApplication } from "@/modules/admin/metrics/metric-composition";
import {
  METRIC_CATEGORIES,
  METRIC_SOURCE_TABLES,
  METRIC_UNITS,
} from "@/modules/admin/metrics/metric-definition";

export const dynamic = "force-dynamic";

const metricInputSchema = z.object({
  id: z.string().min(1).optional(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  category: z.enum(METRIC_CATEGORIES),
  unit: z.enum(METRIC_UNITS),
  precision: z.number().int(),
  requestedTables: z.array(z.enum(METRIC_SOURCE_TABLES)),
  sqlTemplate: z.string().default(""),
});

const scopeSchema = z.object({
  storeIds: z.array(z.string().regex(/^S\d{3}$/)).min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), metric: metricInputSchema }),
  z.object({ action: z.literal("save"), metric: metricInputSchema }),
  z.object({
    action: z.literal("validate"),
    sqlTemplate: z.string(),
    requestedTables: z.array(z.enum(METRIC_SOURCE_TABLES)).optional(),
  }),
  z.object({
    action: z.literal("test"),
    sqlTemplate: z.string(),
    requestedTables: z.array(z.enum(METRIC_SOURCE_TABLES)).optional(),
    scope: scopeSchema,
  }),
  z.object({
    action: z.literal("publish"),
    metric: metricInputSchema,
    scope: scopeSchema,
  }),
  z.object({ action: z.literal("disable"), id: z.string().min(1) }),
  z.object({ action: z.literal("remove"), id: z.string().min(1) }),
]);

export async function GET(request: NextRequest): Promise<Response> {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;
  try {
    return Response.json({ metrics: await metricAdminApplication.list() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;
  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: "请求参数不完整或格式错误。" },
      { status: 400 }
    );
  }

  try {
    switch (parsed.data.action) {
      case "generate":
        return Response.json({
          draft: await metricAdminApplication.generateSql(parsed.data.metric),
        });
      case "save":
        return Response.json({
          metric: await metricAdminApplication.saveDraft(parsed.data.metric),
        });
      case "validate":
        return Response.json({
          validation: metricAdminApplication.validateSql(
            parsed.data.sqlTemplate,
            parsed.data.requestedTables
          ),
        });
      case "test":
        return Response.json({
          result: await metricAdminApplication.testSql(
            parsed.data.sqlTemplate,
            parsed.data.scope,
            parsed.data.requestedTables
          ),
        });
      case "publish":
        return Response.json(
          await metricAdminApplication.publish(
            parsed.data.metric,
            parsed.data.scope
          )
        );
      case "disable":
        return Response.json({
          metric: await metricAdminApplication.disable(parsed.data.id),
        });
      case "remove":
        return Response.json({
          removed: await metricAdminApplication.remove(parsed.data.id),
        });
    }
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): Response {
  if (error instanceof MetricAdminError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "AUTHORING_UNAVAILABLE"
          ? 503
          : 400;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  console.error("Metric admin request failed:", error);
  return Response.json({ error: "指标管理操作失败。" }, { status: 500 });
}
