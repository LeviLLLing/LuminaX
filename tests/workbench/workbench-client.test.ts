import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkbenchContextClientError,
  normalizeWorkbenchContext,
} from "../../src/modules/workbench/workbench-context-client";
import { authorizeIntentMetadata } from "../../src/modules/workbench/workbench-intent-policy";
import {
  getVisibleInsightSections,
  getWorkbenchCopy,
} from "../../src/modules/workbench/workbench-presentation";
import { createWorkbenchContextRequestLifecycle } from "../../src/hooks/workbench-context-lifecycle";
import type { WorkbenchContext } from "../../src/modules/workbench/workbench-types";

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

test("AI intent metadata is intersected with the current workbench context", () => {
  const context = createClientContext();
  assert.deepEqual(
    authorizeIntentMetadata(
      {
        intent: "compare",
        storeIds: ["S001", "S999"],
        startDate: "2025-05-01",
        endDate: "2025-05-07",
      },
      context
    ),
    {
      intent: "compare",
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-07",
    }
  );
  assert.equal(
    authorizeIntentMetadata(
      {
        intent: "report",
        storeIds: ["S001"],
        startDate: "2025-05-01",
        endDate: "2025-05-07",
      },
      context
    ),
    null
  );
});

test("presentation selectors expose only metric-backed sections", () => {
  assert.deepEqual(
    getVisibleInsightSections(["achievement_rate", "channel_mix"]),
    ["totalSales", "achievement", "salesTrend", "channel"]
  );
  assert.equal(getWorkbenchCopy("regional_manager").title, "辖区经营概览");
});

function createClientContext(): WorkbenchContext {
  return {
    templateId: "regional_manager",
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate", "channel_mix"],
    availableIntents: ["achievement_rate", "channel_mix", "compare"],
    canAccessAdmin: false,
  };
}
