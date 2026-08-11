import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createGetWorkbenchContextHandler } from "../../src/app/api/workbench/context/route";
import { SYSTEM_METRIC_DEFINITIONS } from "../../src/modules/admin/metrics/system-metric-catalog";
import { DataAccessDeniedError } from "../../src/modules/admin/permissions/access-control";
import type { PermissionUser } from "../../src/modules/admin/permissions/permission-types";
import type { AuthenticatedUser } from "../../src/modules/auth/auth-types";
import { createWorkbenchContextApplication } from "../../src/modules/workbench/workbench-context-application";
import { resolveWorkbenchTemplate } from "../../src/modules/workbench/workbench-templates";
import { createPublishedMetric, createSystemPermissionUser } from "../fixtures/metrics";
import {
  InMemoryMetricRepository,
  InMemoryPermissionRepository,
} from "../fixtures/repositories";

test("workbench template resolves roles with a safe deterministic fallback", () => {
  const regionalManager = resolveWorkbenchTemplate("manager");
  const superAdmin = resolveWorkbenchTemplate("super_admin");
  const analyst = resolveWorkbenchTemplate("analyst");
  const unknown = resolveWorkbenchTemplate("future_role");

  assert.equal(regionalManager.id, "regional_manager");
  assert.deepEqual(regionalManager.intentOrder.slice(0, 5), [
    "anomaly_detection",
    "achievement_rate",
    "compare",
    "attribution",
    "report",
  ]);
  assert.equal(superAdmin.id, "default");
  assert.equal(analyst.id, "default");
  assert.equal(unknown.id, "default");

  for (const template of [regionalManager, superAdmin, analyst, unknown]) {
    assert.equal(template.intentOrder.at(-1), "custom_metric");
    assert.equal(template.intentOrder.includes("irrelevant" as never), false);
    assert.equal(
      new Set(template.intentOrder).size,
      template.intentOrder.length
    );
  }
});

test("workbench context projects metric and store permissions without leaking policies", async () => {
  const manager = createManagerPermissionUser();
  const permissionRepository = new InMemoryPermissionRepository([
    manager,
    createSystemPermissionUser(),
  ]);
  const metricRepository = new InMemoryMetricRepository();
  await metricRepository.save(createPublishedMetric());
  const application = createWorkbenchContextApplication({
    permissionRepository,
    metricRepository,
    async listStoreIds() {
      return ["S001", "S002"];
    },
  });

  const managerContext = await application.getContext(toAuthenticated(manager));
  assert.deepEqual(managerContext, {
    templateId: "regional_manager",
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate", "custom_sales_total"],
    availableIntents: ["achievement_rate", "custom_metric"],
    canAccessAdmin: false,
  });
  assert.deepEqual(Object.keys(managerContext).sort(), [
    "availableIntents",
    "availableMetricCodes",
    "availableStoreIds",
    "canAccessAdmin",
    "templateId",
  ]);
  assert.equal(JSON.stringify(managerContext).includes("sqlTemplate"), false);
  assert.equal(JSON.stringify(managerContext).includes("allowedColumns"), false);

  const admin = createSystemPermissionUser();
  const adminContext = await application.getContext(toAuthenticated(admin));
  assert.deepEqual(adminContext.availableStoreIds, ["S001", "S002"]);
  assert.deepEqual(adminContext.availableMetricCodes, [
    ...SYSTEM_METRIC_DEFINITIONS.map((metric) => metric.code),
    "custom_sales_total",
  ]);
  assert.deepEqual(
    adminContext.availableIntents,
    resolveWorkbenchTemplate("super_admin").intentOrder
  );
  assert.equal(adminContext.canAccessAdmin, true);
});

test("workbench context API enforces authentication and permission boundaries", async () => {
  const request = new NextRequest("http://localhost/api/workbench/context");
  const user: AuthenticatedUser = {
    id: "manager-one",
    username: "manager.one",
    displayName: "Manager One",
    role: "manager",
  };
  const context = {
    templateId: "regional_manager" as const,
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate"],
    availableIntents: ["achievement_rate" as const],
    canAccessAdmin: false,
  };

  const unauthenticated = await createGetWorkbenchContextHandler({
    async authenticate() {
      return null;
    },
    async getContext() {
      throw new Error("must not run");
    },
  })(request);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");

  const allowed = await createGetWorkbenchContextHandler({
    async authenticate() {
      return user;
    },
    async getContext(receivedUser) {
      assert.deepEqual(receivedUser, user);
      return context;
    },
  })(request);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await allowed.json(), context);

  const denied = await createGetWorkbenchContextHandler({
    async authenticate() {
      return user;
    },
    async getContext() {
      throw new DataAccessDeniedError("denied");
    },
  })(request);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await denied.json(), { error: "denied" });
});

function createManagerPermissionUser(): PermissionUser {
  return {
    id: "manager-one",
    username: "manager.one",
    displayName: "Manager One",
    role: "manager",
    status: "active",
    system: false,
    policies: [
      {
        tableName: "store_master",
        allowedColumns: ["store_id", "store_name"],
        allowedStoreIds: ["S001"],
      },
      {
        tableName: "store_sales_daily",
        allowedColumns: ["store_id", "date", "actual_sales", "order_count"],
        allowedStoreIds: ["S001"],
      },
      {
        tableName: "sales_target_daily",
        allowedColumns: ["store_id", "date", "sales_target"],
        allowedStoreIds: ["S001"],
      },
    ],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

function toAuthenticated(user: PermissionUser): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}
