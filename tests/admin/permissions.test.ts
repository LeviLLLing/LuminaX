import assert from "node:assert/strict";
import test from "node:test";
import {
  DataAccessDeniedError,
  RepositoryAccessControl,
} from "../../src/modules/admin/permissions/access-control";
import { createPermissionAdminApplication } from "../../src/modules/admin/permissions/permission-admin-application";
import { JsonSalesDataSource } from "../../src/modules/data-source/json-sales-data-source";
import { createRestrictedPermissionUser } from "../fixtures/metrics";
import { InMemoryPermissionRepository } from "../fixtures/repositories";

const jsonDataSource = new JsonSalesDataSource();

test("permission control enforces table, column and store value scope", async () => {
  const repository = new InMemoryPermissionRepository([
    createRestrictedPermissionUser(),
  ]);
  const accessControl = new RepositoryAccessControl(repository);
  const requirements = [
    {
      tableName: "store_sales_daily",
      columns: ["store_id", "date", "actual_sales"],
    },
  ];

  const implicitScope = await accessControl.authorizeScope({
    userId: "analyst-one",
    requirements,
    requestedStoreIds: ["S001", "S002"],
    availableStoreIds: ["S001", "S002"],
    strictStoreScope: false,
  });
  assert.deepEqual(implicitScope.storeIds, ["S001"]);

  await assert.rejects(
    () =>
      accessControl.authorizeScope({
        userId: "analyst-one",
        requirements,
        requestedStoreIds: ["S002"],
        availableStoreIds: ["S001", "S002"],
        strictStoreScope: true,
      }),
    DataAccessDeniedError
  );
  await assert.rejects(
    () =>
      accessControl.authorizeScope({
        userId: "analyst-one",
        requirements: [
          {
            tableName: "store_sales_daily",
            columns: ["customer_count"],
          },
        ],
        requestedStoreIds: ["S001"],
        availableStoreIds: ["S001", "S002"],
        strictStoreScope: true,
      }),
    DataAccessDeniedError
  );

  const data = await jsonDataSource.loadSalesData();
  const filtered = await accessControl.filterSalesData("analyst-one", data);
  assert.ok(filtered.store_sales_daily.length > 0);
  assert.ok(
    filtered.store_sales_daily.every((row) => row.store_id === "S001")
  );
  assert.deepEqual(
    Object.keys(filtered.store_sales_daily[0]).sort(),
    ["actual_sales", "date", "store_id"]
  );
  assert.deepEqual(filtered.sales_target_daily, []);
});

test("permission admin saves policies and simulator explains decisions", async () => {
  const repository = new InMemoryPermissionRepository([]);
  const accessControl = new RepositoryAccessControl(repository);
  const application = createPermissionAdminApplication(
    repository,
    accessControl,
    () => new Date("2026-08-10T08:00:00.000Z")
  );
  const user = await application.saveUser({
    username: "sherry",
    displayName: "Sherry",
    role: "analyst",
    status: "active",
    policies: [
      {
        tableName: "store_sales_daily",
        allowedColumns: ["store_id", "actual_sales"],
        allowedStoreIds: ["S001"],
      },
    ],
  });

  const allowed = await application.evaluate(
    user.id,
    "store_sales_daily",
    "actual_sales",
    "S001"
  );
  const denied = await application.evaluate(
    user.id,
    "store_sales_daily",
    "actual_sales",
    "S002"
  );
  assert.equal(allowed.allowed, true);
  assert.equal(denied.allowed, false);
});
