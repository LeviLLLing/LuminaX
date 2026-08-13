import type { NextRequest } from "next/server";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import {
  authenticateRequest,
  unauthenticatedResponse,
} from "@/modules/auth/auth-http";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { insightApplication } from "@/modules/insights/insight-composition";
import type { InsightSnapshotDto } from "@/modules/insights/insight-types";

export const dynamic = "force-dynamic";

export interface GetLatestInsightRouteDependencies {
  authenticate(request: NextRequest): Promise<AuthenticatedUser | null>;
  getLatest(userId: string): Promise<InsightSnapshotDto | null>;
}

export function createGetLatestInsightHandler({
  authenticate,
  getLatest,
}: GetLatestInsightRouteDependencies) {
  return async function getLatestInsight(request: NextRequest): Promise<Response> {
    const user = await authenticate(request);
    if (!user) return withoutCaching(unauthenticatedResponse());

    try {
      return withoutCaching(
        Response.json({ insight: await getLatest(user.id) })
      );
    } catch (error) {
      if (error instanceof DataAccessDeniedError) {
        return withoutCaching(
          Response.json({ error: "Insight access denied" }, { status: 403 })
        );
      }
      console.error("Failed to load latest insight:", errorName(error));
      return withoutCaching(
        Response.json({ error: "Latest insight unavailable" }, { status: 500 })
      );
    }
  };
}

export const GET = createGetLatestInsightHandler({
  authenticate: authenticateRequest,
  getLatest: (userId) => insightApplication.getLatest(userId),
});

function withoutCaching(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
