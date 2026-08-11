import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/modules/auth/session-manager";

export async function POST(request: NextRequest): Promise<Response> {
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}
