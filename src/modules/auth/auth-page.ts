import { cookies } from "next/headers";
import { authApplication } from "./auth-composition";
import { AUTH_COOKIE_NAME } from "./session-manager";

export async function getPageUser() {
  const cookieStore = await cookies();
  return authApplication.authenticateSession(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );
}

