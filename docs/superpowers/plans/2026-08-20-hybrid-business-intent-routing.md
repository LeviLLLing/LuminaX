# Hybrid Business Intent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DeepSeek-backed, strictly validated business intent router with deterministic entity extraction and rule fallback, while preserving the existing three-Agent architecture and public contracts.

**Architecture:** A stateless `BusinessIntentRouter` selects only an allowlisted system intent from the current question, scope hint, and one bounded previous user question. `BusinessAgent` keeps deterministic date/store extraction, custom metric matching, authorization, and SQL execution; invalid or unavailable model routing falls back to the existing classifier enhanced for broad multi-store sales questions.

**Tech Stack:** TypeScript 5, Node test runner through `tsx`, DeepSeek `AgentModel`, Next.js 16 runtime composition, existing in-memory Agent memory.

## Global Constraints

- Governance Agent remains the only component that allows or rejects requests.
- The router cannot return `irrelevant` or `custom_metric`, change dates/stores, generate SQL, or invoke tools.
- Model route confidence must be a finite number in `[0, 1]` and at least `0.70`.
- Default routing timeout is `8_000` ms through `DEEPSEEK_INTENT_TIMEOUT_MS`.
- Published custom metric name/code/alias matching takes precedence over system intent routing.
- Model failure must not block a legitimate business request.
- Preserve current SSE intent payloads, `AnalysisIntent` string values, permissions, SQL interfaces, and three-Agent runtime structure.
- Do not log raw questions, model responses, cookies, permission values, or SQL parameters.

---

## File Structure

- Create `src/modules/intent/business-intent-router.ts`: public router contracts, strict model parser, fallback orchestration, and sanitized route event.
- Create `src/modules/agents/prompts/business-intent-router-system-prompt.ts`: compact allowlisted intent definitions and output contract.
- Modify `src/modules/intent/intent-classifier.ts`: add scope hints and broad multi-store fallback rules without changing entity parsing behavior.
- Modify `src/modules/agents/business/business-agent.ts`: call custom metric matching first, then the router; pass only bounded context; keep execution scope deterministic.
- Modify `src/modules/admin/metrics/custom-metric-runtime.ts`: make equal-score custom metric matches explicitly ambiguous instead of selecting by repository order.
- Modify `src/modules/chat/chat-composition.ts`: create the dedicated intent model and inject the model router.
- Create `tests/intent/business-intent-router.test.ts`: router/parser/fallback unit tests.
- Modify `tests/agents/agents.test.ts`: Business Agent integration, memory context, custom metric precedence, and scope integrity tests.
- Modify `tests/module-interfaces.test.ts`: include the new intent test module.
- Modify `AGENTS.md`: document routing ownership and environment variables.

### Task 1: Deterministic Scope Hints and Fallback Rules

**Files:**
- Modify: `src/modules/intent/intent-classifier.ts`
- Create: `tests/intent/business-intent-router.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Produces: `IntentScopeHint = "single_store" | "multi_store" | "all_stores" | "unspecified"`.
- Produces: `classifyIntent(question: string, context?: { scopeHint?: IntentScopeHint }): IntentResult`.
- Preserves: `extractStoreIds(question)` and `extractDateRange(question)` signatures.

- [x] **Step 1: Write failing fallback classification tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntent } from "../../src/modules/intent/intent-classifier";

test("broad all-store sales questions fall back to compare", () => {
  assert.equal(
    classifyIntent("分析5月1日至5月7日所有门店的销售情况").intent,
    "compare"
  );
  assert.equal(
    classifyIntent("看看经营表现", { scopeHint: "multi_store" }).intent,
    "compare"
  );
});

test("single-store target questions remain achievement analysis", () => {
  assert.equal(
    classifyIntent("上海商场店销售目标完成得怎么样", {
      scopeHint: "single_store",
    }).intent,
    "achievement_rate"
  );
});
```

- [x] **Step 2: Run the focused test and verify the broad query fails**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts`

Expected: FAIL because the first broad all-store question currently returns `achievement_rate`.

- [x] **Step 3: Add the scope hint type and broad-query fallback**

```ts
export type IntentScopeHint =
  | "single_store"
  | "multi_store"
  | "all_stores"
  | "unspecified";

export function classifyIntent(
  question: string,
  context: { scopeHint?: IntentScopeHint } = {}
): IntentResult {
  // Preserve explicit intent precedence, then apply this before the default.
  const broadSales = /(销售情况|经营情况|经营表现|门店表现)/.test(question);
  const broadStores = /(所有门店|全部门店|各门店|多门店)/.test(question);
  if (
    broadSales &&
    (broadStores ||
      context.scopeHint === "multi_store" ||
      context.scopeHint === "all_stores")
  ) {
    intent = "compare";
  }
  // Existing explicit keyword branches remain authoritative.
}
```

- [x] **Step 4: Import the new test module and run it**

Add `import "./intent/business-intent-router.test";` to `tests/module-interfaces.test.ts`.

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts`

Expected: PASS for broad multi-store, single-store target, explicit intent, date, and store parsing cases.

- [x] **Step 5: Commit the deterministic fallback**

```bash
git add src/modules/intent/intent-classifier.ts tests/intent/business-intent-router.test.ts tests/module-interfaces.test.ts
git commit -m "fix: classify broad multi-store sales questions"
```

### Task 2: Strict DeepSeek Intent Router

**Files:**
- Create: `src/modules/intent/business-intent-router.ts`
- Create: `src/modules/agents/prompts/business-intent-router-system-prompt.ts`
- Modify: `tests/intent/business-intent-router.test.ts`

**Interfaces:**
- Consumes: `AgentModel`, `AnalysisIntent`, `IntentScopeHint`, and fallback `classifyIntent`.
- Produces: `SystemAnalysisIntent = Exclude<AnalysisIntent, "irrelevant" | "custom_metric">`.
- Produces: `BusinessIntentRouter.route(input): Promise<BusinessIntentRouteResult>`.
- Produces: `createBusinessIntentRouter({ model, fallback?, now? }): BusinessIntentRouter`.

- [x] **Step 1: Add failing tests for valid, low-confidence, and invalid model output**

```ts
test("model router accepts only a confident allowlisted intent", async () => {
  const model = new FakeAgentModel("intent-model", () =>
    JSON.stringify({ intent: "compare", confidence: 0.92 })
  );
  const router = createBusinessIntentRouter({ model });
  const result = await router.route({
    question: "分析所有门店销售情况",
    scopeHint: "all_stores",
    previousUserQuestion: null,
  });
  assert.equal(result.intent, "compare");
  assert.equal(result.source, "model");
});

test("router falls back on low confidence or forbidden intent", async () => {
  for (const response of [
    JSON.stringify({ intent: "compare", confidence: 0.4 }),
    JSON.stringify({ intent: "custom_metric", confidence: 0.99 }),
    "not-json",
    null,
  ]) {
    const router = createBusinessIntentRouter({
      model: new FakeAgentModel("intent-model", () => response),
    });
    const result = await router.route({
      question: "分析所有门店销售情况",
      scopeHint: "all_stores",
      previousUserQuestion: null,
    });
    assert.equal(result.intent, "compare");
    assert.equal(result.source, "fallback");
  }
});
```

- [x] **Step 2: Run the focused router tests and verify missing exports fail**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts`

Expected: FAIL because `createBusinessIntentRouter` and its types do not exist.

- [x] **Step 3: Implement the router contracts and strict parser**

```ts
export interface BusinessIntentRouteInput {
  question: string;
  scopeHint: IntentScopeHint;
  previousUserQuestion: string | null;
}

export interface BusinessIntentRouteResult {
  intent: SystemAnalysisIntent;
  confidence: number;
  source: "model" | "fallback";
  fallbackReason: "timeout" | "empty" | "invalid_json" | "invalid_intent" | "low_confidence" | null;
  durationMs: number;
  disagreesWithFallback: boolean;
}

const ALLOWED_INTENTS = new Set<SystemAnalysisIntent>([
  "achievement_rate", "order_trend", "aov_trend", "channel_mix",
  "daypart_analysis", "promotion_contribution", "refund_rate",
  "anomaly_detection", "report", "compare", "attribution",
]);
```

Use `extractJsonObject`, reject extra execution fields by reading only an exact object with `intent` and `confidence`, require `confidence >= 0.70`, and call `classifyIntent(question, { scopeHint })` for every fallback. Build the model message with `serializePromptData` so user text remains data.

- [x] **Step 4: Add the compact system prompt**

```ts
export const BUSINESS_INTENT_ROUTER_SYSTEM_PROMPT = `
你是 LuminaX Business Agent 内部的业务意图路由器。
只能返回 {"intent":"允许的意图","confidence":0到1之间的数值}。
不得返回日期、门店、SQL、解释、建议或工具调用。
全部或多门店的宽泛销售情况使用 compare；单店目标完成使用 achievement_rate；
为什么或原因使用 attribution；只有明确要求周报或报告时使用 report。
订单数量走势使用 order_trend；客单价或 AOV 使用 aov_trend；
销售渠道或渠道占比使用 channel_mix；早餐、午餐、下午茶、晚餐或时段使用 daypart_analysis；
促销、优惠和活动贡献使用 promotion_contribution；退款或取消使用 refund_rate；
异常、波动和异常日期使用 anomaly_detection。
`.trim();
```

- [x] **Step 5: Run router tests and type checking**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts && pnpm run ts-check`

Expected: PASS; no public `AnalysisIntent` values change.

- [x] **Step 6: Commit the model router**

```bash
git add src/modules/intent/business-intent-router.ts src/modules/agents/prompts/business-intent-router-system-prompt.ts tests/intent/business-intent-router.test.ts
git commit -m "feat: add validated business intent router"
```

### Task 3: Custom Metric Match Precedence and Ambiguity

**Files:**
- Modify: `src/modules/admin/metrics/custom-metric-runtime.ts`
- Modify: `tests/admin/metrics.test.ts`
- Modify: `tests/agents/agents.test.ts`

**Interfaces:**
- Replaces: `CustomMetricRuntime.match(question): Promise<CustomMetricDefinition | null>`.
- Produces: `CustomMetricMatchResult = { status: "matched"; metric } | { status: "none" | "ambiguous"; metric: null }`.
- Produces: `CustomMetricRuntime.match(question): Promise<CustomMetricMatchResult>`.

- [x] **Step 1: Write failing tests for a unique and equal-score match**

```ts
test("custom metric matching refuses equal-score ambiguity", async () => {
  const repository = new InMemoryMetricRepository();
  await repository.save({
    ...createPublishedMetric(),
    id: "metric-a",
    code: "repurchase_rate",
    name: "复购率",
    aliases: ["会员复购"],
  });
  await repository.save({
    ...createPublishedMetric(),
    id: "metric-b",
    code: "member_rate",
    name: "会员率",
    aliases: ["会员复购"],
  });
  const runtime = new RegisteredCustomMetricRuntime(
    repository,
    { async run() { return { rows: [], rowCount: 0, columns: [] }; } }
  );
  assert.equal((await runtime.match("分析会员复购")).status, "ambiguous");
});
```

- [x] **Step 2: Run the admin metric test and verify the old return type fails**

Run: `pnpm exec tsx --test tests/admin/metrics.test.ts`

Expected: FAIL because `match` currently returns a metric or `null` and silently selects one equal-score match.

- [x] **Step 3: Implement explicit match results**

```ts
export type CustomMetricMatchResult =
  | { status: "matched"; metric: CustomMetricDefinition }
  | { status: "none" | "ambiguous"; metric: null };

const top = matches[0];
if (!top) return { status: "none", metric: null };
if (matches[1]?.score === top.score) {
  return { status: "ambiguous", metric: null };
}
return { status: "matched", metric: top.metric };
```

Update all test fakes to return the new union. Do not execute a custom SQL when status is `ambiguous`.

- [x] **Step 4: Run admin and Agent tests**

Run: `pnpm exec tsx --test tests/admin/metrics.test.ts tests/agents/agents.test.ts`

Expected: PASS; unique custom matches retain precedence and ambiguity yields no custom execution.

- [x] **Step 5: Commit custom matching**

```bash
git add src/modules/admin/metrics/custom-metric-runtime.ts tests/admin/metrics.test.ts tests/agents/agents.test.ts
git commit -m "fix: reject ambiguous custom metric matches"
```

### Task 4: Business Agent Routing Integration

**Files:**
- Modify: `src/modules/agents/business/business-agent.ts`
- Modify: `tests/agents/agents.test.ts`

**Interfaces:**
- Consumes: optional `intentRouter?: BusinessIntentRouter` in `BusinessAgentDependencies`.
- Preserves: deterministic fallback when `intentRouter` is omitted, so existing test factories remain valid.
- Produces: `resolveIntentScopeHint(question, requestedStoreIds, uiStoreIds): IntentScopeHint` as a private helper.

- [x] **Step 1: Write failing integration tests**

```ts
test("business agent uses routed intent but deterministic date and stores", async () => {
  const routed: BusinessIntentRouter = {
    async route() {
      return {
        intent: "compare", confidence: 0.95, source: "model",
        fallbackReason: null, durationMs: 1, disagreesWithFallback: true,
      };
    },
  };
  const executor = recordingExecutor(["S001", "S002"]);
  const agent = createBusinessAgent({
    metricQueryExecutor: executor,
    model: answerModel,
    memory: new InMemoryAgentMemory(),
    attributionAgent,
    intentRouter: routed,
  });
  await agent.execute({
    sessionId: "route-session",
    question: "分析5月1日至5月7日所有门店销售情况",
  });
  assert.deepEqual(executor.calls[0], {
    intent: "compare",
    scope: { storeIds: ["S001", "S002"], startDate: "2025-05-01", endDate: "2025-05-07" },
  });
});
```

Also assert: custom match skips `intentRouter.route`; an ambiguous custom match continues to system routing; router input includes only the last user question truncated to 300 characters; Governance rejection remains outside this component.

- [x] **Step 2: Run Agent tests and verify the router dependency is unsupported**

Run: `pnpm exec tsx --test tests/agents/agents.test.ts`

Expected: FAIL because `BusinessAgentDependencies` has no `intentRouter` and execution still uses `classifyIntent` directly.

- [x] **Step 3: Integrate routing without changing entity authority**

Refactor the start of `execute` to this order:

```ts
const deterministic = classifyIntent(request.question, { scopeHint });
const customMatch = customMetricRuntime
  ? await customMetricRuntime.match(request.question)
  : { status: "none" as const, metric: null };
const routed = customMatch.status === "matched"
  ? null
  : await (intentRouter || deterministicRouter).route({
      question: request.question,
      scopeHint,
      previousUserQuestion: lastUserQuestion(memory.history(request.sessionId)),
    });
const finalIntent = customMatch.status === "matched"
  ? "custom_metric"
  : routed!.intent;
```

Reuse `extractDateRange` and `extractStoreIds` results. Do not read dates or stores from router output. Continue to call existing `authorizeScope` after the final intent is selected.

- [x] **Step 4: Run focused Agent and chat contract tests**

Run: `pnpm exec tsx --test tests/agents/agents.test.ts tests/chat/chat.test.ts tests/contracts/public-contracts.test.ts`

Expected: PASS; routed intent reaches SQL, callbacks, SSE, and insight planning without payload changes.

- [x] **Step 5: Commit Business Agent integration**

```bash
git add src/modules/agents/business/business-agent.ts tests/agents/agents.test.ts
git commit -m "feat: route business intent before SQL execution"
```

### Task 5: Runtime Composition, Sanitized Telemetry, and Documentation

**Files:**
- Modify: `src/modules/intent/business-intent-router.ts`
- Modify: `src/modules/chat/chat-composition.ts`
- Modify: `tests/intent/business-intent-router.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: optional `onRoute(event: BusinessIntentRouteEvent): void` dependency.
- Event fields: `intent`, `source`, `confidenceBand`, `durationMs`, `fallbackReason`, `disagreesWithFallback`; no raw prompt or response.

- [x] **Step 1: Add a failing telemetry redaction test**

```ts
test("route telemetry contains no user or model text", async () => {
  const events: BusinessIntentRouteEvent[] = [];
  const router = createBusinessIntentRouter({
    model: new FakeAgentModel("intent-model", () =>
      JSON.stringify({ intent: "refund_rate", confidence: 0.88 })
    ),
    onRoute: (event) => events.push(event),
  });
  await router.route({
    question: "分析退款",
    scopeHint: "all_stores",
    previousUserQuestion: null,
  });
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "confidenceBand", "disagreesWithFallback", "durationMs",
    "fallbackReason", "intent", "source",
  ]);
});
```

- [x] **Step 2: Run the router test and verify the observer is missing**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts`

Expected: FAIL because `onRoute` is not implemented.

- [x] **Step 3: Add sanitized route observation and runtime model composition**

```ts
const intentTimeoutMs = Number(process.env.DEEPSEEK_INTENT_TIMEOUT_MS || 8_000);
const intentRouter = createBusinessIntentRouter({
  model: new DeepSeekChatModel({
    model:
      process.env.DEEPSEEK_INTENT_MODEL ||
      process.env.DEEPSEEK_BUSINESS_MODEL ||
      defaultModel,
    timeoutMs: intentTimeoutMs,
  }),
  onRoute: (event) => console.info("[intent-route]", JSON.stringify(event)),
});
```

Inject `intentRouter` into `createBusinessAgent`. Validate `DEEPSEEK_INTENT_TIMEOUT_MS` as a positive finite value and fall back to `8_000` when invalid.

- [x] **Step 4: Update AGENTS.md**

Document that Business intent routing uses `DEEPSEEK_INTENT_MODEL || DEEPSEEK_BUSINESS_MODEL || DEEPSEEK_MODEL`, is stateless, may read one bounded previous user question, and cannot alter entity scope or SQL parameters.

- [x] **Step 5: Run focused verification**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts tests/agents/agents.test.ts tests/chat/chat.test.ts tests/contracts/public-contracts.test.ts && pnpm run ts-check && pnpm run lint:build`

Expected: all commands PASS; no raw question appears in captured route events.

- [x] **Step 6: Commit runtime composition**

```bash
git add src/modules/intent/business-intent-router.ts src/modules/chat/chat-composition.ts tests/intent/business-intent-router.test.ts AGENTS.md
git commit -m "feat: compose DeepSeek intent routing"
```

### Task 6: Local Acceptance Verification

**Files:**
- No production file changes expected.
- Test evidence comes from focused command output and one local authenticated request.

**Interfaces:**
- Verifies the final `intent` SSE event and deterministic scope for the approved hard case.

- [x] **Step 1: Run the complete affected test set**

Run: `pnpm exec tsx --test tests/intent/business-intent-router.test.ts tests/admin/metrics.test.ts tests/agents/agents.test.ts tests/chat/chat.test.ts tests/contracts/public-contracts.test.ts`

Expected: PASS.

- [x] **Step 2: Run static validation**

Run: `pnpm run ts-check && pnpm run lint:build`

Expected: PASS.

- [x] **Step 3: Restart only the port 5000 LuminaX process and perform the hard acceptance request**

Submit `分析2025年5月1日至5月7日所有门店的销售情况` through the authenticated local UI or API.

Expected SSE facts:

```text
intent=compare
storeIds=S001,S002,S003,S004,S005 (subject to the authenticated user's authorized set)
startDate=2025-05-01
endDate=2025-05-07
```

Repeat once with `DEEPSEEK_INTENT_TIMEOUT_MS=1` in a controlled restart to force fallback. Expected: the same intent and scope.

- [x] **Step 4: Record the verification without committing runtime state**

Confirm `.env.local`, `.luminax/`, logs, cookies, and credentials remain untracked. Do not commit local request output.
