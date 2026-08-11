import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkbenchContextClientError,
  normalizeWorkbenchContext,
} from "../../src/modules/workbench/workbench-context-client";
import { createWorkbenchContextRequestLifecycle } from "../../src/hooks/workbench-context-lifecycle";

test("client context normalizes templates without widening authorization", () => {
  assert.deepEqual(
    normalizeWorkbenchContext({
      templateId: "future_template",
      availableStoreIds: ["S001", "S001"],
      availableMetricCodes: ["achievement_rate"],
      availableIntents: ["achievement_rate"],
      canAccessAdmin: false,
    }),
    {
      templateId: "default",
      availableStoreIds: ["S001"],
      availableMetricCodes: ["achievement_rate"],
      availableIntents: ["achievement_rate"],
      canAccessAdmin: false,
    }
  );
});

test("client context rejects missing permission collections", () => {
  assert.throws(
    () => normalizeWorkbenchContext({ templateId: "default" }),
    WorkbenchContextClientError
  );
});

test("stale request completion cannot clear the newer request loading state", () => {
  const staleRequest = createWorkbenchContextRequestLifecycle();
  const currentRequest = createWorkbenchContextRequestLifecycle();
  let isLoading = false;

  staleRequest.deactivate();
  currentRequest.runIfActive(() => {
    isLoading = true;
  });

  assert.equal(
    staleRequest.runIfActive(() => {
      isLoading = false;
    }),
    false
  );
  assert.equal(isLoading, true);
});
