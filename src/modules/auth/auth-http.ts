import type { NextRequest } from "next/server";
import { authApplication } from "./auth-composition";
import { AUTH_COOKIE_NAME } from "./session-manager";
import type { AuthenticatedUser } from "./auth-types";

export async function authenticateRequest(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  return authApplication.authenticateSession(
    request.cookies.get(AUTH_COOKIE_NAME)?.value
  );
}

export function unauthenticatedResponse(): Response {
  return Response.json({ error: "请先登录。" }, { status: 401 });
}

