# All-Intent Insight Priority Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every authorized LuminaX analysis produce deterministic, evidence-backed, subject-diverse insight findings whose focus remains correct even when DeepSeek is unavailable.

**Architecture:** Complete intent-specific source catalogs feed an allowlisted `InsightAttentionStrategy` registry. Strategies lock finding sources, severity, evidence, and action contexts before DeepSeek runs; the model may write only hypotheses and actions tied to those contexts, while the existing validator and repository preserve public API, permissions, and persistence contracts.

**Tech Stack:** TypeScript 5, Node test runner through `tsx`, DeepSeek `AgentModel`, existing Insight Application/Composer/Validator, React 19 admin UI, Zod API schemas, file-backed custom metric registry.

## Global Constraints

- Execute after the hybrid business intent routing plan so the framework receives the single final routed `AnalysisIntent`.
- SQL and published custom SQL remain the only numeric authority.
- `AnalysisIntent` comes from the approved routing design and is not reclassified inside insights.
- Findings are deterministic; DeepSeek cannot select, replace, reorder, or rewrite numeric facts.
- High-risk subjects must be selected before normal subjects, with one primary finding per subject before support facts.
- No benchmark means no negative or positive business judgment; structure-only facts remain neutral/low.
- Model failure must generate the same findings and a successful insight update.
- Governance rejection does not update insights; valid no-data analysis updates successfully.
- Preserve public `InsightSnapshot`, SSE, MySQL, SQL Server adapter, permission, and runtime repository compatibility.
- Existing custom metric registry records without `insightPolicy` must load without migration.
- Do not commit `.env.local`, `.luminax/`, logs, API keys, passwords, cookies, or generated runtime data.

---

## File Structure

- Create `src/modules/insights/insight-attention-plan.ts`: plan types, subject diversity selector, no-risk/no-data helpers.
- Create `src/modules/insights/insight-attention-registry.ts`: exhaustive `AnalysisIntent` strategy registry and public `buildInsightAttentionPlan` entrypoint.
- Create `src/modules/insights/insight-performance-strategies.ts`: achievement, compare, order, and AOV policies.
- Create `src/modules/insights/insight-risk-structure-strategies.ts`: refund, anomaly, channel, daypart, and promotion policies.
- Create `src/modules/insights/insight-summary-strategies.ts`: attribution, report, and custom metric policies.
- Modify `src/modules/insights/insight-source-catalog.ts`: complete achievement/report catalogs and attention metadata for every source.
- Modify `src/modules/insights/insight-composer.ts`: accept locked plans and parse only context-bound hypotheses/actions.
- Modify `src/modules/insights/insight-application.ts`: build a plan between catalog construction and composition; use plan-based fallback.
- Modify `src/modules/insights/insight-types.ts`: internal draft context fields only; keep snapshot DTO unchanged.
- Modify `src/modules/insights/insight-validator.ts`: materialize locked facts and deterministic healthy/no-data headlines.
- Create `tests/insights/insight-attention.test.ts`: table-driven strategy tests.
- Modify `tests/insights/insight-generation.test.ts` and `tests/insights/insight-application.test.ts`: model/fallback/integration tests.
- Modify `tests/module-interfaces.test.ts`: include the attention test module.
- Modify `src/modules/admin/metrics/metric-definition.ts`: optional `MetricInsightPolicy` contract.
- Modify `src/modules/admin/metrics/metric-admin-application.ts`: normalize and validate policy combinations.
- Modify `src/modules/admin/metrics/custom-metric-runtime.ts`: include policy in authorized custom execution metadata.
- Modify `src/app/api/admin/metrics/route.ts`: backward-compatible optional policy schema.
- Modify `src/components/admin/MetricRegistryPanel.tsx`: modular policy controls.
- Modify `tests/admin/metrics.test.ts`: registry and validation compatibility.
- Modify `AGENTS.md`: document deterministic strategy ownership and custom policy behavior.

### Task 1: Attention Plan Domain and Subject Diversity

**Files:**
- Create: `src/modules/insights/insight-attention-plan.ts`
- Create: `tests/insights/insight-attention.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Produces: `InsightAttentionStatus = "risk" | "healthy" | "no_data"`.
- Produces: `InsightAttentionCandidate`, `InsightActionContext`, and `InsightAttentionPlan`.
- Produces: `selectDiverseCandidates(candidates, { maxFindings, minFindings }): InsightAttentionCandidate[]`.

- [x] **Step 1: Write failing subject-diversity tests**

```ts
test("primary findings cover distinct subjects before support facts", () => {
  const selected = selectDiverseCandidates([
    candidate("metro-rate", "S004", "primary", 100),
    candidate("metro-gap", "S004", "support", 95),
    candidate("community-rate", "S005", "primary", 90),
    candidate("community-gap", "S005", "support", 85),
  ], { maxFindings: 3, minFindings: 1 });
  assert.deepEqual(selected.map((item) => item.sourceId), [
    "metro-rate", "community-rate", "metro-gap",
  ]);
});

test("healthy plans do not invent risk findings to reach three items", () => {
  const selected = selectDiverseCandidates([
    candidate("overall", "scope", "primary", 10, "positive"),
  ], { maxFindings: 5, minFindings: 1 });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].severity, "positive");
});
```

- [x] **Step 2: Run the focused test and verify missing module failure**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: FAIL because the attention plan module does not exist.

- [x] **Step 3: Implement the domain types and two-pass selector**

```ts
export interface InsightAttentionCandidate {
  sourceId: string;
  subjectKey: string;
  role: "primary" | "support";
  score: number;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  evidenceIds: string[];
}

export interface InsightActionContext {
  id: string;
  sourceId: string;
  subjectLabel: string;
  severity: InsightSeverity;
  mode: "improve" | "verify" | "monitor";
  verificationMetricCode: string;
}

export interface InsightAttentionPlan {
  status: "risk" | "healthy" | "no_data";
  findings: InsightDraft["findings"];
  actionContexts: InsightActionContext[];
}
```

Sort candidates by descending score and stable `sourceId`; select `primary` candidates with distinct `subjectKey` first, then support candidates until `maxFindings`. Never add candidates solely to satisfy three findings.

- [x] **Step 4: Include and run the new test module**

Add `import "./insights/insight-attention.test";` to `tests/module-interfaces.test.ts`.

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: PASS.

- [x] **Step 5: Commit the attention domain**

```bash
git add src/modules/insights/insight-attention-plan.ts tests/insights/insight-attention.test.ts tests/module-interfaces.test.ts
git commit -m "feat: add deterministic insight attention plans"
```

### Task 2: Complete Source Catalogs and Attention Metadata

**Files:**
- Modify: `src/modules/insights/insight-source-catalog.ts`
- Modify: `tests/insights/insight-generation.test.ts`

**Interfaces:**
- Produces on `InsightFindingSource`: `attention: { subjectKey; role; signal; benchmark?; delta? }`.
- Produces: dedicated `buildAchievementRate` and `buildReport` catalog builders.
- Preserves: `buildInsightSourceCatalog({ intent, analysisData }): InsightSourceCatalog`.

- [x] **Step 1: Add failing complete-catalog tests for the reported bug**

```ts
test("achievement catalog includes every store instead of the first five values", () => {
  const catalog = buildInsightSourceCatalog({
    intent: "achievement_rate",
    analysisData: achievementFixture([
      store("S001", "上海商场店", 102),
      store("S004", "地铁站店", 82),
      store("S005", "社区中心店", 94),
    ]),
  });
  const rateLabels = catalog.findingSources
    .filter((item) => item.metricCode === "achievement_rate")
    .map((item) => item.label);
  assert.deepEqual(rateLabels, [
    "上海商场店目标达成率", "地铁站店目标达成率", "社区中心店目标达成率",
  ]);
});
```

Add a report fixture with `summary`, `storeRanking`, `dailyTrend`, and breakdowns; assert its catalog includes overall achievement, every store achievement, refund rate, and anomaly dates rather than generic first fields.

- [x] **Step 2: Run generation tests and verify achievement/report failures**

Run: `pnpm exec tsx --test tests/insights/insight-generation.test.ts`

Expected: FAIL because `achievement_rate` and `report` still use `buildGeneric`.

- [x] **Step 3: Add attention metadata and dedicated builders**

```ts
export interface InsightSourceAttentionMetadata {
  subjectKey: string;
  role: "primary" | "support";
  signal:
    | "achievement" | "trend" | "risk_rate" | "anomaly"
    | "structure" | "contribution" | "data_availability" | "neutral";
  benchmark?: number;
  delta?: number;
}
```

Extend `CatalogBuilder.source` with the metadata argument. For achievement sources, set each store rate as `primary/achievement`, gap and sales/target as `support`, and include cross-store rate plus sales-versus-target evidence. For report, expose overall achievement/refund, all store achievements, daily anomaly facts, and structure evidence.

- [x] **Step 4: Annotate existing intent builders**

Assign stable `subjectKey` values from the first store/date/dimension subject ID. Mark rates/trends/anomaly counts as primary and raw values/targets as support. Mark channel/daypart/promotion values as `structure`; attribution contributions as `contribution`; record count as `data_availability`.

- [x] **Step 5: Run catalog tests and type checking**

Run: `pnpm exec tsx --test tests/insights/insight-generation.test.ts && pnpm run ts-check`

Expected: PASS; source IDs and public evidence DTOs remain deterministic.

- [x] **Step 6: Commit complete catalogs**

```bash
git add src/modules/insights/insight-source-catalog.ts tests/insights/insight-generation.test.ts
git commit -m "fix: build complete insight source catalogs"
```

### Task 3: Performance Attention Strategies

**Files:**
- Create: `src/modules/insights/insight-performance-strategies.ts`
- Create: `src/modules/insights/insight-attention-registry.ts`
- Modify: `tests/insights/insight-attention.test.ts`

**Interfaces:**
- Produces: `InsightAttentionStrategy.build(catalog): InsightAttentionPlan`.
- Produces: `buildInsightAttentionPlan({ intent, catalog, customPolicy? }): InsightAttentionPlan`.
- Handles: `achievement_rate`, `compare`, `order_trend`, and `aov_trend`.

- [x] **Step 1: Add table-driven failing policy tests**

```ts
test("achievement strategy ranks actual underperformers independent of row order", () => {
  const plan = buildInsightAttentionPlan({
    intent: "achievement_rate",
    catalog: catalogForRates([
      ["S001", "上海商场店", 102],
      ["S004", "地铁站店", 82],
      ["S005", "社区中心店", 94],
    ]),
  });
  assert.deepEqual(plan.findings.slice(0, 2).map(subjectOfFinding), ["S004", "S005"]);
  assert.deepEqual(plan.findings.slice(0, 2).map((item) => item.severity), ["high", "medium"]);
});
```

Add these table-driven assertions:

```ts
for (const [name, intent, catalog, expected] of [
  ["healthy achievement", "achievement_rate", catalogForRates([["S001", "A", 101]]), "positive"],
  ["order critical rate", "order_trend", orderCatalog("S001", 89, 2), "high"],
  ["order critical trend", "order_trend", orderCatalog("S001", 101, -10), "high"],
  ["aov critical ratio", "aov_trend", aovCatalog("S001", 89, 100, 1), "high"],
  ["aov critical trend", "aov_trend", aovCatalog("S001", 101, 100, -10), "high"],
] as const) {
  test(name, () => {
    assert.equal(buildInsightAttentionPlan({ intent, catalog }).findings[0].severity, expected);
  });
}
```

For compare, construct a low-sales store at 105% and a high-sales store at 85%; assert only the 85% store is a risk finding.

- [x] **Step 2: Run attention tests and verify missing strategy failures**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: FAIL because the performance strategy and registry do not exist.

- [x] **Step 3: Implement achievement and compare policies**

Use these exact bands:

```ts
function achievementSeverity(rate: number): InsightSeverity {
  if (rate < 90) return "high";
  if (rate < 100) return "medium";
  return "positive";
}
```

Score lower rates higher with `100 - rate`; select one rate per underperforming store before gaps. For compare tie-breaking use target-gap percentage, refund rate, then stable subject key. Raw sales, orders, and AOV without targets are support/verification signals only.

- [x] **Step 4: Implement order and AOV policies**

Order high risk: `orderAchievementRate < 90 || trendPct <= -10`; medium: rate below 100 or any negative trend. AOV high risk: `avgAOV / targetAOV * 100 < 90 || trendPct <= -10`; medium: negative gap or negative trend. Return healthy positive plans when no negative signal exists.

- [x] **Step 5: Run attention tests**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: PASS for all performance bands, stable ordering, and subject diversity.

- [x] **Step 6: Commit performance strategies**

```bash
git add src/modules/insights/insight-performance-strategies.ts src/modules/insights/insight-attention-registry.ts tests/insights/insight-attention.test.ts
git commit -m "feat: rank performance insight signals"
```

### Task 4: Risk and Structure Attention Strategies

**Files:**
- Create: `src/modules/insights/insight-risk-structure-strategies.ts`
- Modify: `src/modules/insights/insight-attention-registry.ts`
- Modify: `tests/insights/insight-attention.test.ts`

**Interfaces:**
- Handles: `refund_rate`, `anomaly_detection`, `channel_mix`, `daypart_analysis`, and `promotion_contribution`.

- [x] **Step 1: Add failing risk and neutral-structure tests**

```ts
test("refund and anomaly strategies apply explicit risk bands", () => {
  const refundPlan = planFor("refund_rate", refundCatalog({
    overall: 1.2, stores: [["S004", 2.4], ["S005", 1.8]],
  }));
  assert.equal(refundPlan.findings[0].severity, "high");
  assert.equal(subjectOfFinding(refundPlan.findings[0]), "S004");

  const anomalyPlan = planFor("anomaly_detection", anomalyCatalog([
    ["S004", 2], ["S005", 1],
  ]));
  assert.deepEqual(anomalyPlan.findings.map((item) => item.severity), ["high", "medium"]);
});

test("structure metrics never invent risk without a benchmark", () => {
  for (const intent of ["channel_mix", "daypart_analysis", "promotion_contribution"] as const) {
    const plan = planFor(intent, structureCatalog(intent));
    assert.ok(plan.findings.every((item) => item.severity === "low" || item.severity === "positive"));
  }
});
```

- [x] **Step 2: Run attention tests and verify unsupported intents fail**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: FAIL because the registry has no risk/structure strategies.

- [x] **Step 3: Implement refund and anomaly policies**

Refund above `2` percentage points is high. A store at or below `2` but at least `0.5` percentage points above overall is medium. Others are low/positive. Anomaly count at least two is high, exactly one is medium, zero is positive; sort counts descending and anomaly evidence by absolute z-score when available.

- [x] **Step 4: Implement structure policies**

Rank largest share/contribution and widest cross-store spread for visibility, but use `low` severity and `needs_verification` confidence. Action contexts use `verify` mode and request capacity/margin/customer/ROI benchmarks. No “异常、下滑、低效” claims are generated from unbenchmarked shares.

- [x] **Step 5: Run attention tests and commit**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: PASS.

```bash
git add src/modules/insights/insight-risk-structure-strategies.ts src/modules/insights/insight-attention-registry.ts tests/insights/insight-attention.test.ts
git commit -m "feat: rank risk and structure insight signals"
```

### Task 5: Attribution, Report, Custom, and No-Data Strategies

**Files:**
- Create: `src/modules/insights/insight-summary-strategies.ts`
- Modify: `src/modules/insights/insight-attention-registry.ts`
- Modify: `tests/insights/insight-attention.test.ts`

**Interfaces:**
- Handles: `attribution`, `report`, `custom_metric`, and legal no-data catalogs.
- Rejects: `irrelevant` with `INSUFFICIENT_SOURCE_DATA` before plan creation.

- [x] **Step 1: Add failing summary-strategy tests**

Add these exact assertions:

```ts
test("summary strategies preserve business priority", () => {
  const attribution = planFor("attribution", attributionCatalog([
    ["orders", -30], ["aov", -20], ["channel", 10],
  ]));
  assert.deepEqual(attribution.findings.slice(0, 2).map(metricOfFinding), ["orders", "aov"]);

  const report = planFor("report", reportCatalog({
    overallRate: 94, worstStoreRate: 88, refundRate: 2.4, anomalyCount: 1,
  }));
  assert.deepEqual(report.findings.slice(0, 3).map(metricOfFinding), [
    "achievement_rate", "store_achievement_rate", "refund_rate",
  ]);

  const custom = planFor("custom_metric", customCatalog(42));
  assert.ok(custom.findings.every((item) => item.severity === "low"));

  const noData = planFor("custom_metric", noDataCatalog());
  assert.equal(noData.status, "no_data");
  assert.equal(noData.findings[0].severity, "positive");
});
```

- [x] **Step 2: Run the tests and verify registry gaps**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts`

Expected: FAIL for attribution, report, and custom intents.

- [x] **Step 3: Implement attribution and report ordering**

For negative total gap, score negative contributions by `Math.abs(value)` and assign the largest negative driver high, remaining negative drivers medium. Positive drivers remain support. For reports use the exact existing alert bands: overall rate below 95 is high, individual rates below 90 are high, rates from 90 to below 100 are medium, refund above 2 is high, and anomaly dates are verification support.

- [x] **Step 4: Implement neutral custom and no-data behavior**

Without `customPolicy`, custom metric facts use `low` severity and `verify` action mode. `data_availability=0` returns one positive finding, no risk hypotheses, and one `P2` monitor action context. `irrelevant` never gets a strategy entry.

- [x] **Step 5: Make the registry exhaustive**

Use a `satisfies Record<SystemInsightIntent, InsightAttentionStrategy>` registry so TypeScript fails when a new enabled insight intent has no strategy. Keep `irrelevant` outside `SystemInsightIntent`.

- [x] **Step 6: Run tests and commit**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts && pnpm run ts-check`

Expected: PASS.

```bash
git add src/modules/insights/insight-summary-strategies.ts src/modules/insights/insight-attention-registry.ts tests/insights/insight-attention.test.ts
git commit -m "feat: complete insight attention strategy registry"
```

### Task 6: Lock Findings Before DeepSeek and Bind Actions to Context

**Files:**
- Modify: `src/modules/insights/insight-types.ts`
- Modify: `src/modules/insights/insight-composer.ts`
- Modify: `src/modules/agents/prompts/insight-composer-system-prompt.ts`
- Modify: `src/modules/insights/insight-application.ts`
- Modify: `src/modules/insights/insight-validator.ts`
- Modify: `tests/insights/insight-generation.test.ts`
- Modify: `tests/insights/insight-application.test.ts`

**Interfaces:**
- `InsightComposer.compose` consumes `plan: InsightAttentionPlan` in addition to catalog/scope.
- Model output uses `contextId` for verification/actions and contains no findings.
- `createGroundedInsightDraft(catalog, plan): InsightDraft` always copies `plan.findings`.
- Public `InsightSnapshot` and DTO remain unchanged.

- [x] **Step 1: Add failing model and fallback locking tests**

Test a model response that attempts to reference Shanghai while the plan requires Metro and Community. Assert the persisted findings still equal plan findings. Test null, malformed JSON, unknown context ID, numeric action prose, and missing required high-risk context; all must use the same deterministic findings.

- [x] **Step 2: Run generation/application tests and verify current composer allows free finding selection**

Run: `pnpm exec tsx --test tests/insights/insight-generation.test.ts tests/insights/insight-application.test.ts`

Expected: FAIL because composer input has no plan and model output currently includes arbitrary `findings`.

- [x] **Step 3: Change the internal model draft contract**

```ts
interface InsightModelDraft {
  verificationItems: Array<{
    contextId: string;
    hypothesis: string;
    requiredCheck: string;
  }>;
  actions: Array<{
    contextId: string;
    title: string;
    ownerRole: InsightOwnerRole;
  }>;
}
```

Map each valid `contextId` back to the plan's `sourceId`, priority, and `verificationMetricCode`. Reject unknown/duplicate contexts and require an action for every high-risk context up to the three-context cap.

- [x] **Step 4: Update the composer prompt**

Remove model-selected findings and numeric fact prose. Provide locked finding labels, severities, action context IDs, subject labels, modes, allowed owner roles, and allowed verification metrics. Explicitly state that causes remain hypotheses and no numeric claims may appear in generated prose.

- [x] **Step 5: Build the plan in Insight Application**

```ts
const catalog = buildCatalog({ intent: analysis.intent, analysisData: analysis.analysisData });
const plan = buildInsightAttentionPlan({ intent: analysis.intent, catalog });
const draft = await composer.compose({ ...input, catalog, plan });
```

On model or semantic validation failure, call `createGroundedInsightDraft(catalog, plan)`. Keep generation tokens, authorization, repository CAS, and SSE lifecycle unchanged.

- [x] **Step 6: Add healthy/no-data deterministic headlines**

Risk headline uses the first ranked risk finding. Healthy headline states that the scope has no material risk and can be monitored. No-data headline remains `当前范围暂无可用经营数据，洞察已更新`.

- [x] **Step 7: Run focused insight tests and commit**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts tests/insights/insight-generation.test.ts tests/insights/insight-application.test.ts tests/insights/insight-types.test.ts`

Expected: PASS; model and fallback findings are identical for the same catalog.

```bash
git add src/modules/insights/insight-types.ts src/modules/insights/insight-composer.ts src/modules/agents/prompts/insight-composer-system-prompt.ts src/modules/insights/insight-application.ts src/modules/insights/insight-validator.ts tests/insights/insight-generation.test.ts tests/insights/insight-application.test.ts
git commit -m "fix: lock insight findings before model composition"
```

### Task 7: Backward-Compatible Custom Metric Insight Policy

**Files:**
- Modify: `src/modules/admin/metrics/metric-definition.ts`
- Modify: `src/modules/admin/metrics/metric-admin-application.ts`
- Modify: `src/modules/admin/metrics/custom-metric-runtime.ts`
- Modify: `src/app/api/admin/metrics/route.ts`
- Modify: `src/components/admin/MetricRegistryPanel.tsx`
- Modify: `src/modules/insights/insight-summary-strategies.ts`
- Modify: `tests/admin/metrics.test.ts`
- Modify: `tests/insights/insight-attention.test.ts`

**Interfaces:**
- Produces: optional `MetricInsightPolicy` on custom metric input/definition/execution.
- Preserves: old JSON records with missing policy normalize to `null`.

- [x] **Step 1: Add failing policy validation and compatibility tests**

```ts
test("old custom metrics load with a neutral insight policy", async () => {
  const metric = createPublishedMetric();
  delete (metric as Partial<typeof metric>).insightPolicy;
  await repository.save(metric);
  assert.equal((await repository.findById(metric.id))?.insightPolicy ?? null, null);
});

test("metric publication rejects invalid policy thresholds", async () => {
  await assert.rejects(
    app.saveDraft({
      ...validInput,
      insightPolicy: {
        direction: "lower_is_better",
        benchmark: "absolute",
        warningThreshold: 3,
        criticalThreshold: 2,
        targetValue: null,
      },
    }),
    /严重阈值/
  );
});
```

- [x] **Step 2: Run admin tests and verify missing type/schema failures**

Run: `pnpm exec tsx --test tests/admin/metrics.test.ts`

Expected: FAIL because `insightPolicy` is not defined or accepted.

- [x] **Step 3: Add the policy domain type and normalization**

```ts
export interface MetricInsightPolicy {
  direction: "higher_is_better" | "lower_is_better" | "target_is_best" | "neutral";
  benchmark: "absolute" | "target" | "scoped_average" | "none";
  warningThreshold: number | null;
  criticalThreshold: number | null;
  targetValue: number | null;
}
```

Require finite values, non-negative deviation thresholds for target/scoped-average, `targetValue` for target modes, and a critical threshold farther into the risk region than warning. Normalize omitted policy to `null`; preserve it when SQL changes.

- [x] **Step 4: Extend the admin route and runtime metadata**

Add this optional nullable Zod object to create/generate/publish actions:

```ts
const metricInsightPolicySchema = z.object({
  direction: z.enum(["higher_is_better", "lower_is_better", "target_is_best", "neutral"]),
  benchmark: z.enum(["absolute", "target", "scoped_average", "none"]),
  warningThreshold: z.number().finite().nullable(),
  criticalThreshold: z.number().finite().nullable(),
  targetValue: z.number().finite().nullable(),
}).nullable().optional();
```

Include `insightPolicy` in `CustomMetricExecution.metric`, then pass it to `buildInsightAttentionPlan` for custom intent. Do not expose SQL or permission details.

Use the custom execution object already stored in `BusinessAnalysisContext.analysisData`:

```ts
const customPolicy = analysis.intent === "custom_metric"
  ? readMetricInsightPolicy(analysis.analysisData)
  : null;
const plan = buildInsightAttentionPlan({
  intent: analysis.intent,
  catalog,
  customPolicy,
});
```

- [x] **Step 5: Add modular admin controls**

In `MetricRegistryPanel`, add an “洞察判断” switch and render the controls in the existing form grid:

```tsx
<Switch
  checked={form.insightPolicy !== null}
  onCheckedChange={(checked) => setForm({
    ...form,
    insightPolicy: checked
      ? { direction: "neutral", benchmark: "none", warningThreshold: null, criticalThreshold: null, targetValue: null }
      : null,
  })}
/>
```

When enabled, use existing `Select` controls for direction/benchmark and `Input type="number"` controls for warning, critical, and conditional target. Keep the controls in the existing un-nested panel and disable target input unless direction is `target_is_best` or benchmark is `target`.

- [x] **Step 6: Add custom policy strategy tests**

Assert `lower_is_better` above critical is high, above warning is medium; `higher_is_better` below critical is high; target mode uses absolute deviation; neutral/missing policy never creates risk.

- [x] **Step 7: Run admin and insight tests**

Run: `pnpm exec tsx --test tests/admin/metrics.test.ts tests/insights/insight-attention.test.ts && pnpm run ts-check`

Expected: PASS; old metric registry fixtures still load.

- [x] **Step 8: Commit custom policy support**

```bash
git add src/modules/admin/metrics/metric-definition.ts src/modules/admin/metrics/metric-admin-application.ts src/modules/admin/metrics/custom-metric-runtime.ts src/app/api/admin/metrics/route.ts src/components/admin/MetricRegistryPanel.tsx src/modules/insights/insight-summary-strategies.ts tests/admin/metrics.test.ts tests/insights/insight-attention.test.ts
git commit -m "feat: configure custom metric insight policies"
```

### Task 8: Contracts, Documentation, and Local Acceptance

**Files:**
- Modify: `tests/contracts/public-contracts.test.ts`
- Modify: `tests/chat/chat.test.ts`
- Modify: `AGENTS.md`
- No runtime state files committed.

**Interfaces:**
- Verifies unchanged public Insight/SSE contracts and correct hard-case focus.

- [x] **Step 1: Add a contract regression for unchanged DTO/SSE shapes**

Assert deterministic plan metadata and custom policy internals do not appear in `InsightSnapshotDto` or SSE events. Preserve `generating`, `updated`, `failed`, `insightId`, `findingCount`, `actionCount`, and optional generation reference fields.

- [x] **Step 2: Add the hard-case chat/insight integration test**

Feed authorized analysis for 2025-05-01 through 2025-05-07 where Shanghai is 102%, Metro is 82%, and Community is 94%. Assert Chatbox content remains complete, insight status is `updated`, and the first two findings have subjects `S004` and `S005`; no risk finding uses `S001`.

- [x] **Step 3: Update AGENTS.md**

Document source catalog completeness, the strategy registry as the sole attention authority, deterministic locked findings, model-bound action contexts, exact threshold ownership, neutral unbenchmarked structure metrics, and optional custom metric policies.

- [x] **Step 4: Run the complete affected suite**

Run: `pnpm exec tsx --test tests/insights/insight-attention.test.ts tests/insights/insight-generation.test.ts tests/insights/insight-application.test.ts tests/insights/insight-types.test.ts tests/admin/metrics.test.ts tests/agents/agents.test.ts tests/chat/chat.test.ts tests/contracts/public-contracts.test.ts`

Expected: PASS.

- [x] **Step 5: Run static and build verification**

Run: `pnpm run ts-check && pnpm run lint:build && pnpm run build`

Expected: PASS.

- [x] **Step 6: Verify the admin UI at desktop and mobile widths**

Start LuminaX on port 5000. In the authenticated metric registry, enable and disable the policy switch, change direction/benchmark, validate conditional target input, save a draft, reload, and confirm values persist. Check 1440px and 390px widths for overlap and text clipping.

- [x] **Step 7: Verify the reported scenario through the local UI**

Ask `分析2025年5月1日至2025年5月7日所有门店的销售情况`.

Expected:

```text
Chatbox: complete all-store analysis
Insight lifecycle: updated
Primary risk subjects: 地铁站店, 社区中心店
上海商场店: absent from risk findings unless its SQL facts satisfy a configured risk rule
```

Repeat with the insight model forced to time out. Expected: identical primary findings and successful update.

- [x] **Step 8: Commit contracts and documentation**

```bash
git add tests/contracts/public-contracts.test.ts tests/chat/chat.test.ts AGENTS.md
git commit -m "test: verify all-intent insight priority framework"
```
