import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkbenchTemplate } from "../../src/modules/workbench/workbench-templates";

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
