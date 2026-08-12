import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import { authApplication } from "../../src/modules/auth/auth-composition";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "../../src/modules/auth/session-manager";
import type { ChatApplication } from "../../src/modules/chat/chat-application";
import { ChatApplicationError } from "../../src/modules/chat/chat-application";
import { handleChatHttpRequest } from "../../src/modules/chat/chat-http-adapter";
import { streamChatResponse } from "../../src/modules/chat/sse-response";
import { DataAccessDeniedError } from "../../src/modules/admin/permissions/access-control";
import { createPostWeeklyReportHandler } from "../../src/app/api/reports/weekly/route";
import type { AuthenticatedUser } from "../../src/modules/auth/auth-types";

test("public chat SSE wire format remains stable", async () => {
  const response = streamChatResponse(
    {
      intent: "achievement_rate",
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-14",
      relevant: true,
      outOfScope: false,
    },
    "分析完成",
    ["S001"],
    "2025-05-01",
    "2025-05-14"
  );

  assert.equal(
    response.headers.get("Content-Type"),
    "text/event-stream; charset=utf-8"
  );
  assert.equal(response.headers.get("Cache-Control"), "no-cache");
  assert.equal(
    await response.text(),
    'data: {"type":"intent","intent":"achievement_rate","storeIds":["S001"],"startDate":"2025-05-01","endDate":"2025-05-14"}\n\n' +
      'data: {"type":"content","content":"分析完成"}\n\n' +
      "data: [DONE]\n\n"
  );
});

test("public JSON errors preserve status and body", async (context) => {
  context.mock.method(authApplication, "authenticateSession", async () => ({
    id: "contract-user",
    username: "contract-user",
    displayName: "Contract User",
    role: "analyst",
  }));
  context.mock.method(console, "error", () => undefined);

  const mappings = [
    {
      error: new ChatApplicationError("MISSING_QUESTION", "Missing question"),
      status: 400,
      body: { error: "Missing question" },
    },
    {
      error: new ChatApplicationError("ACCESS_DENIED", "没有权限"),
      status: 403,
      body: { error: "没有权限" },
    },
    {
      error: new ChatApplicationError("DATA_NOT_LOADED", "数据加载失败"),
      status: 500,
      body: { error: "数据加载失败" },
    },
  ] as const;

  for (const mapping of mappings) {
    const application: ChatApplication = {
      async execute() {
        throw mapping.error;
      },
    };
    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${AUTH_COOKIE_NAME}=contract-session`,
      },
      body: JSON.stringify({ question: "contract request" }),
    });

    const response = await handleChatHttpRequest(request, application);

    assert.equal(response.status, mapping.status);
    assert.equal(
      response.headers.get("Content-Type"),
      "application/json; charset=utf-8"
    );
    assert.deepEqual(await response.json(), mapping.body);
  }
});

test("authentication cookie contract remains stable", async (context) => {
  const user = {
    id: "system-admin",
    username: "admin",
    displayName: "System Administrator",
    role: "super_admin" as const,
  };
  context.mock.method(authApplication, "login", async () => ({
    user,
    token: "contract-session-token",
    expiresAt: new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000),
  }));

  assert.equal(AUTH_COOKIE_NAME, "luminax_session");
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 8 * 60 * 60);

  for (const protocol of ["http", "https"] as const) {
    const secure = protocol === "https";
    const loginStartedAt = Date.now();
    const loginResponse = await login(
      new NextRequest(`${protocol}://localhost/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "contract" }),
      })
    );
    const loginFinishedAt = Date.now();

    assert.equal(loginResponse.status, 200);
    assert.deepEqual(await loginResponse.json(), { user });
    assertCookie(loginResponse, {
      value: "contract-session-token",
      expires: {
        earliest:
          loginStartedAt + AUTH_SESSION_MAX_AGE_SECONDS * 1000 - 1_000,
        latest:
          loginFinishedAt + AUTH_SESSION_MAX_AGE_SECONDS * 1000 + 1_000,
      },
      maxAge: "28800",
      secure,
    });

    const logoutResponse = await logout(
      new NextRequest(`${protocol}://localhost/api/auth/logout`, {
        method: "POST",
      })
    );

    assert.equal(logoutResponse.status, 200);
    assert.deepEqual(await logoutResponse.json(), { loggedOut: true });
    assertCookie(logoutResponse, {
      value: "",
      expires: "Thu, 01 Jan 1970 00:00:00 GMT",
      maxAge: "0",
      secure,
    });
  }
});

test("weekly report API enforces authentication, payload and permission contracts", async () => {
  const user: AuthenticatedUser = {
    id: "manager-one",
    username: "manager.one",
    displayName: "Manager One",
    role: "manager",
  };
  const validRequest = () =>
    new NextRequest("http://localhost/api/reports/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2025-05-01",
        endDate: "2025-05-14",
        storeIds: ["S001"],
      }),
    });

  const unauthenticated = await createPostWeeklyReportHandler({
    async authenticate() {
      return null;
    },
    async generate() {
      throw new Error("must not run");
    },
  })(validRequest());
  assert.equal(unauthenticated.status, 401);

  const malformed = await createPostWeeklyReportHandler({
    async authenticate() {
      return user;
    },
    async generate() {
      throw new Error("must not run");
    },
  })(
    new NextRequest("http://localhost/api/reports/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: "bad", endDate: "2025-05-14" }),
    })
  );
  assert.equal(malformed.status, 400);

  const denied = await createPostWeeklyReportHandler({
    async authenticate() {
      return user;
    },
    async generate() {
      throw new DataAccessDeniedError("denied");
    },
  })(validRequest());
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "denied" });

  const allowed = await createPostWeeklyReportHandler({
    async authenticate() {
      return user;
    },
    async generate(input) {
      assert.deepEqual(input, {
        userId: "manager-one",
        startDate: "2025-05-01",
        endDate: "2025-05-14",
        storeIds: ["S001"],
      });
      return "<!DOCTYPE html><p>report</p>";
    },
  })(validRequest());
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    html: "<!DOCTYPE html><p>report</p>",
  });
  assert.equal(allowed.headers.get("Cache-Control"), "no-store");
});

function assertCookie(
  response: Response,
  expected: {
    value: string;
    expires: string | { earliest: number; latest: number };
    maxAge: string;
    secure: boolean;
  }
): void {
  const header = response.headers.get("Set-Cookie");
  assert.ok(header, "expected a Set-Cookie header");
  const [cookie, ...attributeParts] = header.split("; ");
  assert.equal(cookie, `${AUTH_COOKIE_NAME}=${expected.value}`);

  const attributes = new Map<string, string | true>();
  for (const attribute of attributeParts) {
    const separator = attribute.indexOf("=");
    if (separator === -1) {
      attributes.set(attribute, true);
    } else {
      attributes.set(
        attribute.slice(0, separator),
        attribute.slice(separator + 1)
      );
    }
  }

  assert.equal(attributes.get("Path"), "/");
  const expires = attributes.get("Expires");
  assert.ok(typeof expires === "string");
  if (typeof expected.expires === "string") {
    assert.equal(expires, expected.expires);
  } else {
    const expiresAt = Date.parse(expires);
    assert.ok(
      expiresAt >= expected.expires.earliest &&
        expiresAt <= expected.expires.latest,
      `expected Expires between ${new Date(expected.expires.earliest).toUTCString()} and ${new Date(expected.expires.latest).toUTCString()}, received ${expires}`
    );
  }
  assert.equal(attributes.get("Max-Age"), expected.maxAge);
  assert.equal(attributes.get("HttpOnly"), true);
  assert.equal(attributes.get("SameSite"), "strict");
  assert.equal(attributes.has("Secure"), expected.secure);
}
