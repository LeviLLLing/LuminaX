import type { NextRequest } from "next/server";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import { unauthenticatedResponse } from "@/modules/auth/auth-http";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import type { WorkbenchContext } from "@/modules/workbench/workbench-types";

export interface WorkbenchContextRouteDependencies {
  authenticate(request: NextRequest): Promise<AuthenticatedUser | null>;
  getContext(user: AuthenticatedUser): Promise<WorkbenchContext>;
}

export function createGetWorkbenchContextHandler({
  authenticate,
  getContext,
}: WorkbenchContextRouteDependencies) {
  return async function getWorkbenchContext(
    request: NextRequest
  ): Promise<Response> {
    const user = await authenticate(request);
    if (!user) return withoutCaching(unauthenticatedResponse());

    try {
      return withoutCaching(Response.json(await getContext(user)));
    } catch (error) {
      if (error instanceof DataAccessDeniedError) {
        return withoutCaching(
          Response.json({ error: error.message }, { status: 403 })
        );
      }
      console.error("Failed to load workbench context:", error);
      return withoutCaching(
        Response.json(
          { error: "Workbench context unavailable" },
          { status: 500 }
        )
      );
    }
  };
}

function withoutCaching(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
