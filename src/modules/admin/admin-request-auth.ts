import type { NextRequest } from "next/server";
import { authenticateRequest } from "@/modules/auth/auth-http";

export async function authorizeAdminRequest(
  request: NextRequest
): Promise<Response | null> {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "请先登录。" }, { status: 401 });
  }
  if (user.role !== "super_admin") {
    return Response.json({ error: "仅系统管理员可以访问管理后台。" }, { status: 403 });
  }

  const hostname = request.nextUrl.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    return Response.json(
      { error: "本地 POC 管理接口仅允许从 localhost 访问。" },
      { status: 403 }
    );
  }
  return null;
}
