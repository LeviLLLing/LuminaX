import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "../../src/modules/auth/session-manager";
import {
  jsonError,
  streamChatResponse,
} from "../../src/modules/chat/sse-response";

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

test("public JSON errors preserve status and body", async () => {
  const response = jsonError("没有权限", 403);
  assert.equal(response.status, 403);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/json; charset=utf-8"
  );
  assert.deepEqual(await response.json(), { error: "没有权限" });
});

test("authentication cookie contract remains stable", () => {
  assert.equal(AUTH_COOKIE_NAME, "luminax_session");
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 8 * 60 * 60);
});
