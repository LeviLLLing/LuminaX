import type { NextRequest } from "next/server";
import {
  authenticateRequest,
  unauthenticatedResponse,
} from "@/modules/auth/auth-http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const user = await authenticateRequest(request);
  if (!user) return unauthenticatedResponse();
  return Response.json({ user });
}

