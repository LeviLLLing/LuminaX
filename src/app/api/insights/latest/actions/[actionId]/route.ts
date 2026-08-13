import type { NextRequest } from "next/server";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import {
  authenticateRequest,
  unauthenticatedResponse,
} from "@/modules/auth/auth-http";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { insightApplication } from "@/modules/insights/insight-composition";
import {
  InsightConflictError,
  InsightNotFoundError,
} from "@/modules/insights/latest-insight-repository";
import type { InsightSnapshotDto } from "@/modules/insights/insight-types";

export const dynamic = "force-dynamic";

interface UpdateInsightActionBody {
  insightId: string;
  completed: boolean;
}

interface UpdateInsightActionInput extends UpdateInsightActionBody {
  userId: string;
  actionId: string;
}

export interface PatchInsightActionRouteDependencies {
  authenticate(request: NextRequest): Promise<AuthenticatedUser | null>;
  updateAction(input: UpdateInsightActionInput): Promise<InsightSnapshotDto>;
}

interface RouteContext {
  params: Promise<{ actionId: string }>;
}

export function createPatchInsightActionHandler({
  authenticate,
  updateAction,
}: PatchInsightActionRouteDependencies) {
  return async function patchInsightAction(
    request: NextRequest,
    context: RouteContext
  ): Promise<Response> {
    const user = await authenticate(request);
    if (!user) return withoutCaching(unauthenticatedResponse());

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return badRequest();
    }

    const body = parseBody(payload);
    const actionId = (await context.params).actionId.trim();
    if (!body || actionId.length === 0) return badRequest();

    try {
      const insight = await updateAction({
        userId: user.id,
        insightId: body.insightId,
        actionId,
        completed: body.completed,
      });
      return withoutCaching(Response.json({ insight }));
    } catch (error) {
      if (error instanceof DataAccessDeniedError) {
        return mappedError(403, "Insight access denied");
      }
      if (error instanceof InsightNotFoundError) {
        return mappedError(404, "Insight or action not found");
      }
      if (error instanceof InsightConflictError) {
        return mappedError(409, "Insight is no longer current");
      }
      console.error("Failed to update insight action:", errorName(error));
      return mappedError(500, "Insight action update failed");
    }
  };
}

export const PATCH = createPatchInsightActionHandler({
  authenticate: authenticateRequest,
  updateAction: (input) => insightApplication.updateAction(input),
});

function parseBody(value: unknown): UpdateInsightActionBody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "completed" || keys[1] !== "insightId") {
    return null;
  }
  if (typeof record.insightId !== "string" || typeof record.completed !== "boolean") {
    return null;
  }
  const insightId = record.insightId.trim();
  return insightId.length > 0
    ? { insightId, completed: record.completed }
    : null;
}

function badRequest(): Response {
  return mappedError(400, "Invalid insight action request");
}

function mappedError(status: number, message: string): Response {
  return withoutCaching(Response.json({ error: message }, { status }));
}

function withoutCaching(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
