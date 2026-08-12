import type { NextRequest } from "next/server";
import { z } from "zod";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import { authenticateRequest, unauthenticatedResponse } from "@/modules/auth/auth-http";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import type { WeeklyReportRequest } from "@/modules/reports/report-application";
import { reportApplication } from "@/modules/reports/report-composition";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    storeIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => value.startDate <= value.endDate);

interface WeeklyReportRouteDependencies {
  authenticate(request: NextRequest): Promise<AuthenticatedUser | null>;
  generate(input: WeeklyReportRequest): Promise<string>;
}

export function createPostWeeklyReportHandler({
  authenticate,
  generate,
}: WeeklyReportRouteDependencies) {
  return async function postWeeklyReport(request: NextRequest): Promise<Response> {
    const user = await authenticate(request);
    if (!user) return withoutCaching(unauthenticatedResponse());

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return withoutCaching(Response.json({ error: "请求格式无效。" }, { status: 400 }));
    }
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return withoutCaching(Response.json({ error: "周报参数无效。" }, { status: 400 }));
    }

    try {
      const html = await generate({ userId: user.id, ...parsed.data });
      return withoutCaching(Response.json({ html }));
    } catch (error) {
      if (error instanceof DataAccessDeniedError) {
        return withoutCaching(Response.json({ error: error.message }, { status: 403 }));
      }
      console.error("Failed to generate weekly report:", error);
      return withoutCaching(Response.json({ error: "周报生成失败。" }, { status: 500 }));
    }
  };
}

export const POST = createPostWeeklyReportHandler({
  authenticate: authenticateRequest,
  generate: (input) => reportApplication.generate(input),
});

function withoutCaching(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
