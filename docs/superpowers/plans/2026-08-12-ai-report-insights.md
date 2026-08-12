# AI Report Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use one DeepSeek call to generate the weekly report's trend summary and attention items while preserving SQL-derived facts and deterministic silent fallback.

**Architecture:** Keep `WeeklyReportData` as the only numeric source of truth. Add a focused report-insight generator behind the existing `AgentModel` contract, call it from an authenticated server report application/API, and let the browser request final HTML instead of using the API key client-side.

**Tech Stack:** Next.js 16 route handlers, TypeScript, existing `AgentModel`/`DeepSeekChatModel`, Zod, Node test runner.

## Global Constraints

- Change only “经营趋势总结” and “需关注信息”; all KPI, SQL calculations, charts, rankings, and other report sections remain unchanged.
- One DeepSeek request per report, returning both sections in strict JSON.
- Model text may interpret only supplied aggregate facts and may not create or rewrite numbers.
- Model failure, timeout, missing configuration, or invalid output silently uses the current deterministic summary and alerts.
- Escape all model text before placing it in report HTML.
- Do not expose API keys, permission policies, raw transaction rows, prompts, or Agent memory to the browser or model.

## File Map

- `src/modules/reports/report-insight-generator.ts`: prompt payload, model call, strict result parsing, quantity limits, deterministic fallback.
- `src/modules/reports/report-insight-composition.ts`: server-only DeepSeek composition using `DEEPSEEK_REPORT_MODEL || DEEPSEEK_MODEL || deepseek-v4-flash`.
- `src/modules/reports/report-html-escape.ts`: escape model-originated text at the HTML boundary.
- `src/modules/reports/report-model.ts`: report insight result types.
- `src/modules/reports/weekly-report-template.ts`: accept resolved insights and replace only the two approved sections.
- `src/modules/reports/report-engine.ts`: build data, resolve insights, and render final HTML asynchronously while allowing test injection.
- `src/modules/reports/report-application.ts`: authenticate-compatible permission filtering and scoped report orchestration.
- `src/app/api/reports/weekly/route.ts`: authenticated POST endpoint returning `{ html }`.
- `src/modules/reports/report-client.ts`: validated browser transport.
- `src/hooks/use-luminax-controller.ts`: async report request lifecycle and stale-result protection.
- `tests/reports/reports.test.ts`: generator, fallback, escaping, scope, and template regression tests.
- `tests/contracts/public-contracts.test.ts`: report API authentication/error contract.

---

### Task 1: DeepSeek Report Insight Generator

**Files:**
- Create: `src/modules/reports/report-insight-generator.ts`
- Create: `src/modules/reports/report-html-escape.ts`
- Modify: `src/modules/reports/report-model.ts`
- Test: `tests/reports/reports.test.ts`

**Interfaces:**
- Consumes: `AgentModel`, `WeeklyReportData`, existing `buildReportSummaryParts(data)` and `buildReportAlerts(data)`.
- Produces: `ReportInsights`, `generateReportInsights(data, model): Promise<ReportInsights>`, and `escapeReportHtml(value): string`.

- [ ] **Step 1: Add failing tests for one model call and strict parsing**

Use `FakeAgentModel` to return JSON with six trend items and six attention items. Assert one request, four-to-six non-empty trend items, at most five valid attention items, `temperature: 0.2`, and that the serialized prompt includes `totalSales`, `salesTrend`, `storeRanking`, `channelBreakdown`, `categoryBreakdown`, `daypartBreakdown`, `refundRate`, and `anomalies`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx --test tests/reports/reports.test.ts`  
Expected: FAIL because `generateReportInsights` and its result types do not exist.

- [ ] **Step 3: Implement the minimal generator and fallback**

Add these public types:

```ts
export type ReportAttentionSeverity = "high" | "medium" | "low" | "positive";

export interface ReportAttentionItem {
  severity: ReportAttentionSeverity;
  title: string;
  evidence: string;
  action: string;
}

export interface ReportInsights {
  trendSummary: string[];
  attentionItems: ReportAttentionItem[];
  source: "ai" | "fallback";
}
```

`generateReportInsights` must issue exactly one model request with a Chinese system prompt requiring strict JSON, fact-only interpretation, and “建议进一步核查” for unsupported causality. Parse with Zod, trim text, cap trends at six and attention items at five, and require at least one item in each section. On `null`, thrown errors, or invalid JSON, convert existing summary/alerts into `source: "fallback"` without throwing.

- [ ] **Step 4: Add and verify HTML escaping tests**

Assert `escapeReportHtml('<img src=x onerror=alert(1)> & "x"')` returns escaped text with no literal `<img`.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec tsx --test tests/reports/reports.test.ts`  
Expected: PASS.

```bash
git add src/modules/reports/report-insight-generator.ts src/modules/reports/report-html-escape.ts src/modules/reports/report-model.ts tests/reports/reports.test.ts
git commit -m "feat: add AI report insight generator"
```

### Task 2: Server Report Boundary and HTML Integration

**Files:**
- Create: `src/modules/reports/report-insight-composition.ts`
- Create: `src/modules/reports/report-application.ts`
- Create: `src/app/api/reports/weekly/route.ts`
- Modify: `src/modules/reports/report-engine.ts`
- Modify: `src/modules/reports/weekly-report-template.ts`
- Test: `tests/reports/reports.test.ts`
- Test: `tests/contracts/public-contracts.test.ts`

**Interfaces:**
- Consumes: `generateReportInsights`, `DeepSeekChatModel`, `salesDataRepository`, `accessControl.filterSalesData`, and authenticated user ID.
- Produces: `generateWeeklyReportHTML(...): Promise<string>`, `ReportApplication.generate({ userId, startDate, endDate, storeIds }): Promise<string>`, and authenticated `POST /api/reports/weekly` returning `{ html: string }`.

- [ ] **Step 1: Add failing integration tests**

Assert AI trend/attention copy appears in HTML, model markup is escaped, KPI/chart identifiers remain present, and a null/invalid model response produces the existing deterministic copy. Add route contract tests for unauthenticated `401`, valid `{ startDate, endDate, storeIds }`, malformed `400`, permission `403`, and success `{ html }`.

- [ ] **Step 2: Run report and contract tests and verify RED**

Run: `pnpm exec tsx --test tests/reports/reports.test.ts tests/contracts/public-contracts.test.ts`  
Expected: FAIL because the asynchronous engine/application/route do not exist.

- [ ] **Step 3: Implement asynchronous report rendering**

Change `renderWeeklyReportHtml(data, insights)` so the two approved sections render escaped `insights`; map `high` to danger and the other severities to success using the existing alert styles. Change `generateWeeklyReportHTML` to build data, await an injected/default insight generator, and return final HTML. Keep `generateWeeklyReportSummary` deterministic and synchronous.

- [ ] **Step 4: Implement permission-safe server application and route**

The application loads database data, filters it through `accessControl.filterSalesData(userId, data)`, intersects requested store IDs with the filtered `store_master`, then generates the report. The route authenticates with `authenticateRequest`, validates ISO dates and a non-empty optional string array with Zod, returns `401/400/403/500` consistently, and never returns model diagnostics.

- [ ] **Step 5: Compose the report model and run focused tests**

Instantiate one `DeepSeekChatModel` with:

```ts
model:
  process.env.DEEPSEEK_REPORT_MODEL ||
  process.env.DEEPSEEK_MODEL ||
  "deepseek-v4-flash"
```

Run: `pnpm exec tsx --test tests/reports/reports.test.ts tests/contracts/public-contracts.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/reports src/app/api/reports/weekly/route.ts tests/reports/reports.test.ts tests/contracts/public-contracts.test.ts
git commit -m "feat: generate weekly report insights with DeepSeek"
```

### Task 3: Client Integration and Focused Verification

**Files:**
- Create: `src/modules/reports/report-client.ts`
- Modify: `src/hooks/use-luminax-controller.ts`
- Modify: `tests/workbench/workbench-client.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: authenticated `POST /api/reports/weekly`.
- Produces: `requestWeeklyReport(input, signal): Promise<string>` and controller loading/stale-request-safe report generation.

- [ ] **Step 1: Add failing client transport/lifecycle tests**

Assert the client sends only `startDate`, `endDate`, and authorized `storeIds`; preserves `401/403` messages; rejects invalid `{ html }`; and stale report completion cannot overwrite a newer scope request.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`  
Expected: FAIL because the report client and report request lifecycle do not exist.

- [ ] **Step 3: Implement client request and controller integration**

Replace client-side `generateWeeklyReportHTML` usage with `requestWeeklyReport`. Disable duplicate report generation while a request is active, version requests so stale responses are ignored, synchronize authorized store/date scope before displaying the result, and leave the deterministic fallback entirely server-side.

- [ ] **Step 4: Update architecture documentation**

Document that DeepSeek is used only server-side for the two report narrative sections, that SQL-derived report data remains authoritative, and that invalid/unavailable model output silently uses deterministic content.

- [ ] **Step 5: Run focused verification**

Run:

```bash
pnpm exec tsx --test tests/reports/reports.test.ts tests/contracts/public-contracts.test.ts tests/workbench/workbench-client.test.ts
pnpm run ts-check
pnpm run lint:build
pnpm run build
git diff --check
```

Expected: all focused tests, type check, lint, and production build pass; diff check is clean.

- [ ] **Step 6: Commit**

```bash
git add src/modules/reports/report-client.ts src/hooks/use-luminax-controller.ts tests/workbench/workbench-client.test.ts AGENTS.md
git commit -m "feat: request AI-assisted reports from server"
```
