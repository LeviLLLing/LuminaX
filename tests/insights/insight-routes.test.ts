import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { DataAccessDeniedError } from "../../src/modules/admin/permissions/access-control";
import type { AuthenticatedUser } from "../../src/modules/auth/auth-types";
import { createGetLatestInsightHandler } from "../../src/app/api/insights/latest/route";
import { createPatchInsightActionHandler } from "../../src/app/api/insights/latest/actions/[actionId]/route";
import {
  InsightConflictError,
  InsightNotFoundError,
} from "../../src/modules/insights/latest-insight-repository";
import type { InsightSnapshotDto } from "../../src/modules/insights/insight-types";

const user: AuthenticatedUser = {
  id: "u1",
  username: "manager.one",
  displayName: "Manager One",
  role: "manager",
};

const insightDto: InsightSnapshotDto = {
  id: "insight-1",
  sourceQuestion: "Compare store performance",
  sourceIntent: "compare",
  scope: { storeIds: ["S001"], startDate: "2026-08-01", endDate: "2026-08-07", comparisonLabel: null },
  headline: "Store performance needs attention",
  findings: [],
  evidence: [],
  verificationItems: [],
  actions: [{ id: "action-1", priority: "P1", title: "Review store execution", ownerRole: "运营", verificationMetricCode: "sales", verificationMetricLabel: "Sales", completed: true, completedAt: "2026-08-13T00:00:00.000Z" }],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

test("latest insight GET requires login and disables caching", async () => {
  const unauthenticated = await createGetLatestInsightHandler({
    authenticate: async () => null,
    getLatest: async () => { throw new Error("must not run"); },
  })(new NextRequest("http://localhost/api/insights/latest"));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");

  const empty = await createGetLatestInsightHandler({
    authenticate: async () => user,
    getLatest: async (userId) => { assert.equal(userId, "u1"); return null; },
  })(new NextRequest("http://localhost/api/insights/latest"));
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await empty.json(), { insight: null });
});

test("latest insight GET maps authorization and repository errors safely", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const cases = [
    { error: new DataAccessDeniedError("private detail"), status: 403 },
    { error: new Error("database path must stay private"), status: 500 },
  ];
  for (const item of cases) {
    const response = await createGetLatestInsightHandler({
      authenticate: async () => user,
      getLatest: async () => { throw item.error; },
    })(new NextRequest("http://localhost/api/insights/latest"));
    assert.equal(response.status, item.status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(JSON.stringify(await response.json()), /private|database path/);
  }
});

test("action PATCH validates identity, insight id, action id and boolean", async () => {
  const response = await createPatchInsightActionHandler({
    authenticate: async () => user,
    updateAction: async (input) => {
      assert.deepEqual(input, { userId: "u1", insightId: "insight-1", actionId: "action-1", completed: true });
      return insightDto;
    },
  })(createPatchRequest({ insightId: " insight-1 ", completed: true }), {
    params: Promise.resolve({ actionId: " action-1 " }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { insight: insightDto });
});

test("action PATCH rejects malformed and extra request fields", async () => {
  const handler = createPatchInsightActionHandler({
    authenticate: async () => user,
    updateAction: async () => { throw new Error("must not run"); },
  });
  const cases: Array<{ body: unknown; actionId?: string }> = [
    { body: null },
    { body: {} },
    { body: { insightId: "insight-1", completed: true, userId: "u2" } },
    { body: { insightId: "", completed: true } },
    { body: { insightId: "insight-1", completed: "true" } },
    { body: { insightId: "insight-1", completed: true }, actionId: " " },
  ];
  for (const item of cases) {
    const response = await handler(createPatchRequest(item.body), {
      params: Promise.resolve({ actionId: item.actionId ?? "action-1" }),
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const invalidJson = await handler(
    new NextRequest("http://localhost/api/insights/latest/actions/action-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{" }),
    { params: Promise.resolve({ actionId: "action-1" }) }
  );
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.headers.get("Cache-Control"), "no-store");
});

test("action PATCH requires authentication before mutation", async () => {
  const response = await createPatchInsightActionHandler({
    authenticate: async () => null,
    updateAction: async () => { throw new Error("must not run"); },
  })(createPatchRequest({ insightId: "insight-1", completed: true }), {
    params: Promise.resolve({ actionId: "action-1" }),
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("action PATCH maps domain and unknown failures without leaking internals", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const cases = [
    { error: new DataAccessDeniedError("private permission"), status: 403 },
    { error: new InsightNotFoundError("private missing id"), status: 404 },
    { error: new InsightConflictError("private latest id"), status: 409 },
    { error: new Error("private repository path"), status: 500 },
  ];
  for (const item of cases) {
    const response = await createPatchInsightActionHandler({
      authenticate: async () => user,
      updateAction: async () => { throw item.error; },
    })(createPatchRequest({ insightId: "insight-1", completed: false }), {
      params: Promise.resolve({ actionId: "action-1" }),
    });
    assert.equal(response.status, item.status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.doesNotMatch(JSON.stringify(await response.json()), /private/);
  }
});

function createPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/insights/latest/actions/action-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
