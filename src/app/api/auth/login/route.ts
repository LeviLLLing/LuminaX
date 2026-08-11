import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/modules/auth/auth-application";
import {
  authApplication,
  loginAttemptLimiter,
} from "@/modules/auth/auth-composition";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/modules/auth/session-manager";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = loginSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "请输入用户名和密码。" },
      { status: 400 }
    );
  }

  const attemptKey = createAttemptKey(request, parsed.data.username);
  if (!loginAttemptLimiter.canAttempt(attemptKey)) {
    return Response.json(
      { error: "登录失败次数过多，请稍后再试。" },
      { status: 429 }
    );
  }

  try {
    const result = await authApplication.login(
      parsed.data.username,
      parsed.data.password
    );
    loginAttemptLimiter.reset(attemptKey);
    const response = NextResponse.json({ user: result.user });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      sameSite: "strict",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      expires: result.expiresAt,
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    loginAttemptLimiter.recordFailure(attemptKey);
    if (
      error instanceof AuthError &&
      error.code === "INVALID_CREDENTIALS"
    ) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    console.error("Login failed:", error);
    return Response.json({ error: "登录服务暂时不可用。" }, { status: 500 });
  }
}

function createAttemptKey(request: NextRequest, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
  const client = forwardedFor?.trim() || "local";
  return `${client}:${username.trim().toLowerCase()}`;
}
