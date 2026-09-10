# LuminaX Product UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade LuminaX into a coherent light-mode AI decision workspace across login, workbench, weekly report, and admin while preserving every existing business, permission, data, and Agent contract.

**Architecture:** Introduce one semantic design-token layer and one reusable product shell, then let existing workbench templates select presentation profiles without changing authorization. Keep data calculation, SSE, report, insight, and admin APIs untouched; UI components consume the same normalized context and structured insight DTOs they use today.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix/Shadcn primitives, Lucide React, ECharts 6, Node test runner with `tsx`.

## Global Constraints

- Preserve existing business logic, API routes, SSE event shapes, permission rules, SQL metric values, Agent orchestration, and data-source interfaces.
- Optimize light mode only; dark surfaces are limited to the brand header, admin navigation, and focused decision areas.
- Do not add a UI framework, database table, API endpoint, client persistence layer, or heavy animation dependency.
- Keep `WorkbenchTemplateId` values `regional_manager` and `default`; model CEO/CFO/COO reading priorities through the default summary-first profile and permission-backed section ordering rather than new authorization roles.
- `regional_manager` remains action-first; `default` remains summary-first and safely handles super-admin and analyst users.
- LuminaX yellow `#FFE600` is reserved for primary commands, current selection, AI focus, and action emphasis; use red for risk, green for positive state, and blue for neutral data.
- Body text contrast must be at least 4.5:1, mobile controls at least 44px, keyboard focus visible, and nonessential motion disabled under `prefers-reduced-motion`.
- Verify responsive behavior at `1440×900`, `1280×720`, `1024×768`, and `390×844`.

---

## File Structure

### New files

- `src/components/luminax/ProductBrandBar.tsx`: shared dark brand header for login, workbench, and admin variants.
- `src/components/luminax/ProductState.tsx`: shared loading, empty, permission, and recoverable-error presentation.
- `src/components/luminax/workbench/DecisionBrief.tsx`: compact structured insight summary and action progress for the decision collaboration panel.
- `src/components/admin/AdminModuleNavigation.tsx`: desktop and mobile admin capability navigation.
- `tests/ui/design-system.test.ts`: token and chart-theme contract tests.
- `tests/ui/product-shell.test.ts`: login, brand, workbench shell, assistant brief, report, and admin rendering tests.

### Existing files with focused changes

- `src/app/globals.css`: semantic tokens, typography, focus, reduced-motion, and Markdown rules.
- `src/app/login/page.tsx`, `src/components/auth/LoginForm.tsx`: single-task secure login layout and feedback.
- `src/components/luminax/LuminaXApp.tsx`: presentation profile and latest-insight wiring only.
- `src/components/luminax/workbench/WorkbenchShell.tsx`: stable desktop split and mobile pane behavior.
- `WorkbenchHeader.tsx`, `ScopeBar.tsx`: shared branding and normalized range controls.
- `OverviewPanel.tsx`, `AssistantPanel.tsx`: management hierarchy and decision collaboration.
- `InsightCanvas.tsx`, `InsightActionPanel.tsx`, `InsightFindingList.tsx`, `InsightEvidenceSection.tsx`, `InsightActionChecklist.tsx`: formal insight reading hierarchy and consistent state feedback.
- `ReportView.tsx`: report command/read surface around the existing safe HTML.
- `src/modules/workbench/workbench-presentation.ts`: presentation profiles and deterministic section ordering.
- `src/modules/visualization/chart-theme.ts`, `chart-options.ts`, `src/modules/insights/insight-chart-options.ts`: shared semantic chart palette.
- `src/components/admin/AdminShell.tsx`, `MetricRegistryPanel.tsx`, `PermissionManagementPanel.tsx`, `ReservedAdminModule.tsx`: shared admin shell and dense work-focused surfaces.
- `DESIGN.md`, `AGENTS.md`, `README.md`, `tests/docs/documentation.test.ts`: durable design and operating contracts.

---

### Task 1: Semantic Design Tokens and Chart Theme

**Files:**
- Create: `tests/ui/design-system.test.ts`
- Modify: `src/app/globals.css`
- Modify: `src/modules/visualization/chart-theme.ts`
- Modify: `src/modules/visualization/chart-options.ts`
- Modify: `src/modules/insights/insight-chart-options.ts`

**Interfaces:**
- Produces: `LUMINAX_CHART_COLORS` with `primary`, `accent`, `positive`, `risk`, `neutral`, and `series`.
- Produces: `createChartTextStyle()` and the existing `createAxisGrid()` with stable professional defaults.
- Consumes: existing ECharts option builders and CSS theme variables.

- [ ] **Step 1: Write failing token and chart-theme tests**

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LUMINAX_CHART_COLORS,
  createAxisGrid,
  createChartTextStyle,
} from "../../src/modules/visualization/chart-theme";

test("global UI exposes the approved semantic tokens", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  for (const token of [
    "--luminax-ink: #17181a",
    "--luminax-yellow: #ffe600",
    "--luminax-canvas: #f3f4f5",
    "--luminax-data: #2563a6",
    "--luminax-positive: #168354",
    "--luminax-risk: #c53b32",
  ]) assert.ok(css.toLowerCase().includes(token));
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("chart theme uses semantic business colors", () => {
  assert.equal(LUMINAX_CHART_COLORS.primary, "#2563A6");
  assert.equal(LUMINAX_CHART_COLORS.positive, "#168354");
  assert.equal(LUMINAX_CHART_COLORS.risk, "#C53B32");
  assert.ok(LUMINAX_CHART_COLORS.series.length >= 5);
  assert.deepEqual(createChartTextStyle(), {
    color: "#676C75",
    fontFamily: "inherit",
    fontSize: 11,
  });
  assert.equal(createAxisGrid().containLabel, true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec tsx --test tests/ui/design-system.test.ts`  
Expected: FAIL because `LUMINAX_CHART_COLORS`, `createChartTextStyle`, and the new CSS tokens do not exist.

- [ ] **Step 3: Add semantic CSS and chart exports, then replace raw chart colors**

```ts
export const LUMINAX_CHART_COLORS = Object.freeze({
  primary: "#2563A6",
  accent: "#C4AF00",
  positive: "#168354",
  risk: "#C53B32",
  neutral: "#676C75",
  series: ["#2563A6", "#168354", "#C53B32", "#C4AF00", "#0E7490"],
});

export function createChartTextStyle() {
  return { color: "#676C75", fontFamily: "inherit", fontSize: 11 };
}
```

Add the approved `--luminax-*` variables under `:root`, map existing Shadcn semantic variables to them, keep the current `.dark` block only for compatibility, and add a reduced-motion rule that disables nonessential animation and transition durations. Update dashboard and insight option builders to consume `LUMINAX_CHART_COLORS` and `createChartTextStyle()` without changing series data, units, sort order, tooltip values, or baselines.

- [ ] **Step 4: Run design-system and existing chart tests**

Run: `pnpm exec tsx --test tests/ui/design-system.test.ts tests/analysis/analysis.test.ts tests/insights/insight-client.test.ts`  
Expected: PASS; chart options retain the existing data contract.

- [ ] **Step 5: Commit the token and chart slice**

```bash
git add src/app/globals.css src/modules/visualization/chart-theme.ts src/modules/visualization/chart-options.ts src/modules/insights/insight-chart-options.ts tests/ui/design-system.test.ts
git commit -m "feat: establish LuminaX decision UI tokens"
```

---

### Task 2: Role-Aware Presentation Profiles

**Files:**
- Modify: `src/modules/workbench/workbench-presentation.ts`
- Modify: `src/components/luminax/LuminaXApp.tsx`
- Modify: `src/components/luminax/workbench/OverviewPanel.tsx`
- Test: `tests/workbench/workbench-client.test.ts`

**Interfaces:**
- Produces: `WorkbenchPresentationProfile`.
- Produces: `getWorkbenchPresentationProfile(templateId: WorkbenchTemplateId): WorkbenchPresentationProfile`.
- Produces: `getOrderedInsightSections(metricCodes, profile): InsightSectionId[]`.
- Preserves: `WorkbenchTemplateId`, `WorkbenchContext`, permission intersection, and current API payload.

- [ ] **Step 1: Add failing profile tests**

```ts
import {
  getOrderedInsightSections,
  getWorkbenchPresentationProfile,
} from "../../src/modules/workbench/workbench-presentation";

test("presentation profiles adapt priority without widening permissions", () => {
  const regional = getWorkbenchPresentationProfile("regional_manager");
  const executive = getWorkbenchPresentationProfile("default");
  assert.equal(regional.assistantMode, "action_first");
  assert.equal(executive.assistantMode, "summary_first");
  assert.equal(regional.defaultView, "overview");
  assert.deepEqual(
    getOrderedInsightSections(["achievement_rate", "refund_rate"], executive),
    ["totalSales", "achievement", "refund", "salesTrend"]
  );
  assert.doesNotMatch(
    JSON.stringify(getOrderedInsightSections(["achievement_rate"], regional)),
    /channel|refund/
  );
});
```

- [ ] **Step 2: Run the workbench test and verify it fails**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`  
Expected: FAIL because the profile selectors are not exported.

- [ ] **Step 3: Implement deterministic display-only profiles**

```ts
export interface WorkbenchPresentationProfile {
  defaultView: InsightView;
  assistantMode: "summary_first" | "action_first";
  sectionOrder: readonly InsightSectionId[];
  defaultExpandedSections: readonly ("summary" | "findings" | "evidence" | "actions")[];
}

const PRESENTATION_PROFILES: Record<WorkbenchTemplateId, WorkbenchPresentationProfile> = {
  regional_manager: {
    defaultView: "overview",
    assistantMode: "action_first",
    sectionOrder: ["achievement", "totalSales", "orders", "aov", "salesTrend", "refund", "channel", "category", "daypart"],
    defaultExpandedSections: ["summary", "findings", "actions"],
  },
  default: {
    defaultView: "overview",
    assistantMode: "summary_first",
    sectionOrder: ["totalSales", "achievement", "refund", "salesTrend", "orders", "aov", "channel", "category", "daypart"],
    defaultExpandedSections: ["summary", "findings", "evidence"],
  },
};
```

`getOrderedInsightSections` must start from the existing permission-backed visible set and only sort that set. Pass the resolved profile from `LuminaXApp` to `OverviewPanel`; do not change `WorkbenchContext` or the server application.

- [ ] **Step 4: Run workbench and public contract tests**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts tests/workbench/workbench.test.ts tests/contracts/public-contracts.test.ts`  
Expected: PASS; no unavailable section or new context property appears.

- [ ] **Step 5: Commit the presentation profile slice**

```bash
git add src/modules/workbench/workbench-presentation.ts src/components/luminax/LuminaXApp.tsx src/components/luminax/workbench/OverviewPanel.tsx tests/workbench/workbench-client.test.ts
git commit -m "feat: add role-aware workbench presentation"
```

---

### Task 3: Shared Product Brand, States, and Login

**Files:**
- Create: `src/components/luminax/ProductBrandBar.tsx`
- Create: `src/components/luminax/ProductState.tsx`
- Create: `tests/ui/product-shell.test.ts`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `ProductBrandBar({ contextLabel, userLabel?, actions?, compact? })`.
- Produces: `ProductState({ kind, title, description, action? })`, where `kind` is `loading | empty | denied | error`.
- Preserves: login request body, error copy from the API, `nextPath`, rate limiting, and redirect behavior.

- [ ] **Step 1: Write failing brand, login, and state rendering tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../../src/components/auth/LoginForm";
import { ProductBrandBar } from "../../src/components/luminax/ProductBrandBar";
import { ProductState } from "../../src/components/luminax/ProductState";

test("product brand and state primitives expose stable semantics", () => {
  const brand = renderToStaticMarkup(createElement(ProductBrandBar, { contextLabel: "经营决策工作台" }));
  assert.match(brand, /data-luminax-brand="true"/);
  assert.match(brand, /经营决策工作台/);
  const state = renderToStaticMarkup(createElement(ProductState, { kind: "denied", title: "无权访问", description: "请联系管理员" }));
  assert.match(state, /role="alert"/);
  assert.match(state, /无权访问/);
});

test("login remains a single accessible task", () => {
  const html = renderToStaticMarkup(createElement(LoginForm, { nextPath: "/" }));
  assert.match(html, /登录工作台/);
  assert.match(html, /aria-label="显示密码"/);
  assert.match(html, /autocomplete="username"/);
  assert.doesNotMatch(html, /了解更多|联系我们|产品能力/);
});
```

- [ ] **Step 2: Run the UI shell test and verify it fails**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts`  
Expected: FAIL because `ProductBrandBar` and `ProductState` do not exist and the password button lacks the explicit accessible label.

- [ ] **Step 3: Implement shared product primitives and refactor login**

`ProductBrandBar` must render a 56px dark header with a 3px yellow lower edge, visible `LuminaX` brand, optional context label, and an actions slot. `ProductState` must use a stable minimum size, `role="status"` for loading/empty and `role="alert"` for denied/error, and accept a real button/link node as `action`.

Refactor `LoginForm` to use the brand bar above one centered login tool on the light canvas. Keep visible labels and existing submit logic, add `aria-label` to the password visibility command, keep username after failure, and use `aria-busy={loading}` on the form. Remove the split marketing panel without adding feature copy.

- [ ] **Step 4: Run login, auth, and shell tests**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/auth/auth.test.ts tests/contracts/public-contracts.test.ts`  
Expected: PASS; login API and session contracts remain unchanged.

- [ ] **Step 5: Commit the shared shell and login slice**

```bash
git add src/components/luminax/ProductBrandBar.tsx src/components/luminax/ProductState.tsx src/components/auth/LoginForm.tsx src/app/login/page.tsx src/app/layout.tsx tests/ui/product-shell.test.ts
git commit -m "feat: unify LuminaX product shell and login"
```

---

### Task 4: Workbench Shell, Header, and Scope Experience

**Files:**
- Modify: `src/components/luminax/LuminaXApp.tsx`
- Modify: `src/components/luminax/workbench/WorkbenchShell.tsx`
- Modify: `src/components/luminax/workbench/WorkbenchHeader.tsx`
- Modify: `src/components/luminax/workbench/ScopeBar.tsx`
- Modify: `tests/ui/product-shell.test.ts`
- Test: `tests/workbench/workbench-client.test.ts`

**Interfaces:**
- Consumes: `ProductBrandBar` and `ProductState` from Task 3.
- Preserves: all `ScopeBar` value and callback props.
- Produces: stable regions marked by `data-workbench-region="scope|data|assistant"` for semantic testing and debugging.

- [ ] **Step 1: Add failing workbench region and scope tests**

```ts
test("workbench shell keeps stable data and decision regions", () => {
  // Add this import at the top of tests/ui/product-shell.test.ts:
  // import { WorkbenchShell } from "../../src/components/luminax/workbench/WorkbenchShell";
  const html = renderToStaticMarkup(createElement(WorkbenchShell, {
    header: createElement("div", null, "header"),
    scopeBar: createElement("div", null, "scope"),
    dataPanel: createElement("div", null, "data"),
    assistantPanel: createElement("div", null, "assistant"),
  }));
  assert.match(html, /data-workbench-region="scope"/);
  assert.match(html, /data-workbench-region="data"/);
  assert.match(html, /data-workbench-region="assistant"/);
  assert.match(html, /经营数据/);
  assert.match(html, /决策协同/);
});
```

Extend the existing `ScopeBar` render test to assert `aria-label="经营范围"`, the aggregate store option, visible date labels, and no disappearance of authorized stores.

- [ ] **Step 2: Run focused shell and workbench tests and verify failure**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts`  
Expected: FAIL because the region markers and “决策协同” mobile label are absent.

- [ ] **Step 3: Refactor the shell without changing controller ownership**

Use `ProductBrandBar` inside `WorkbenchHeader`, keep admin and logout commands, and show the role-template label as context rather than a decorative badge. Change the desktop split to approximately `minmax(0, 2.1fr) minmax(320px, 1fr)` with a 32–38% assistant cap. Wrap scope, data, and assistant slots in the stable region attributes. Keep the assistant collapse button icon-only with Tooltip and accessible name.

For mobile, retain the two-pane state but label it “经营数据 / 决策协同”. Keep the existing full scope editor initially; only collapse controls into rows when the 390px screenshot proves it necessary. Do not add client persistence for collapsed state.

- [ ] **Step 4: Run shell, workbench, and type tests**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts && pnpm run ts-check`  
Expected: PASS; all scope callbacks and context types remain valid.

- [ ] **Step 5: Commit the workbench shell slice**

```bash
git add src/components/luminax/LuminaXApp.tsx src/components/luminax/workbench/WorkbenchShell.tsx src/components/luminax/workbench/WorkbenchHeader.tsx src/components/luminax/workbench/ScopeBar.tsx tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts
git commit -m "feat: refine LuminaX workbench shell"
```

---

### Task 5: Overview Hierarchy and AI Decision Collaboration

**Files:**
- Create: `src/components/luminax/workbench/DecisionBrief.tsx`
- Modify: `src/components/luminax/LuminaXApp.tsx`
- Modify: `src/components/luminax/workbench/AssistantPanel.tsx`
- Modify: `src/components/luminax/workbench/OverviewPanel.tsx`
- Modify: `tests/ui/product-shell.test.ts`
- Test: `tests/workbench/workbench-client.test.ts`

**Interfaces:**
- Consumes: `InsightSnapshotDto`, the existing `"idle" | "generating" | "failed"` generation state, and `WorkbenchPresentationProfile`.
- Produces: `DecisionBrief({ insight, generationStatus, pendingActionIds, assistantMode, onOpenInsight })`.
- Preserves: chat messages, complete Markdown rendering, suggestions, send behavior, and stream status.

- [ ] **Step 1: Write a failing compact decision-brief test**

Add this test to `tests/workbench/workbench-client.test.ts`, where the typed `insightDto` fixture already exists:

```ts
import { DecisionBrief } from "../../src/components/luminax/workbench/DecisionBrief";

test("decision brief summarizes without duplicating the formal insight", () => {
  const html = renderToStaticMarkup(createElement(DecisionBrief, {
    insight: insightDto,
    generationStatus: "idle",
    pendingActionIds: [],
    assistantMode: "action_first",
    onOpenInsight: () => undefined,
  }));
  assert.match(html, new RegExp(insightDto.headline));
  assert.match(html, /1\/3 项已完成/);
  assert.match(html, /查看完整洞察/);
  assert.doesNotMatch(html, /晚间销售低于对照周期/);
  assert.doesNotMatch(html, /8月1日销售额低于上周同期/);
});
```

Keep the existing `insightDto` fixture local to `workbench-client.test.ts`; do not create a second untyped copy.

- [ ] **Step 2: Run focused UI tests and verify failure**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts`  
Expected: FAIL because `DecisionBrief` does not exist and `AssistantPanel` has no structured insight input.

- [ ] **Step 3: Implement decision collaboration and KPI hierarchy**

`DecisionBrief` may display only the headline, generation state, action completion count, up to two action titles, and the “查看完整洞察” command. It must not render findings summaries, evidence interpretations, or synthesize text from chat Markdown.

Extend `AssistantPanel` props with:

```ts
insight: InsightSnapshotDto | null;
insightGenerationStatus: "idle" | "generating" | "failed";
pendingInsightActionIds: string[];
assistantMode: WorkbenchPresentationProfile["assistantMode"];
onOpenInsight(): void;
```

Keep the full message list below the compact brief so successful insight updates never truncate the complete chat analysis. Rework `OverviewPanel` into un-nested KPI and chart sections, add semantic positive/risk deltas only when already derivable from `DataSummary`, and do not calculate new metrics in React.

- [ ] **Step 4: Run chat, insight, workbench, and type tests**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts tests/chat/chat.test.ts tests/insights/insight-client.test.ts && pnpm run ts-check`  
Expected: PASS; complete answers, insight lifecycle, and latest-request protections remain intact.

- [ ] **Step 5: Commit the decision collaboration slice**

```bash
git add src/components/luminax/workbench/DecisionBrief.tsx src/components/luminax/LuminaXApp.tsx src/components/luminax/workbench/AssistantPanel.tsx src/components/luminax/workbench/OverviewPanel.tsx tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts
git commit -m "feat: add AI decision collaboration surface"
```

---

### Task 6: Formal Insight and Weekly Report Reading Surfaces

**Files:**
- Modify: `src/components/luminax/workbench/InsightCanvas.tsx`
- Modify: `src/components/luminax/workbench/InsightActionPanel.tsx`
- Modify: `src/components/luminax/workbench/InsightFindingList.tsx`
- Modify: `src/components/luminax/workbench/InsightEvidenceSection.tsx`
- Modify: `src/components/luminax/workbench/InsightActionChecklist.tsx`
- Modify: `src/components/luminax/workbench/ReportView.tsx`
- Modify: `tests/workbench/workbench-client.test.ts`
- Modify: `tests/ui/product-shell.test.ts`

**Interfaces:**
- Consumes: existing public `InsightSnapshotDto`, report HTML string, pending action IDs, and callbacks.
- Preserves: insight authorization, scope restoration, evidence linkage, optimistic action state, report HTML escaping, and report request lifecycle.
- Produces: formal `article` landmarks for insight and report reading.

- [ ] **Step 1: Add failing formal-reading and failure-state tests**

Add the import and test to `tests/ui/product-shell.test.ts`:

```ts
import { ReportView } from "../../src/components/luminax/workbench/ReportView";

test("formal report surface is distinct from the dashboard", () => {
  const html = renderToStaticMarkup(createElement(ReportView, {
    reportHTML: "<!DOCTYPE html><h1>区域经营周报</h1>",
  }));
  assert.match(html, /aria-label="经营周报"/);
  assert.match(html, /正式报告/);
  assert.doesNotMatch(html, /总销售额.*目标达成率.*订单量/);
});
```

Extend existing insight tests to assert one `article` labelled “洞察与行动”, stable sections for “核心判断 / 关键发现 / 支持证据 / 待核查项 / 行动清单”, and that internal errors are still absent from the rendered markup.

- [ ] **Step 2: Run the focused report and insight tests and verify failure**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/workbench/workbench-client.test.ts tests/reports/reports.test.ts`  
Expected: FAIL because report and insight surfaces lack the approved formal-reading landmarks and copy.

- [ ] **Step 3: Apply the approved reading hierarchy**

Keep `InsightCanvas` as the view router. Make the insight body a full-width article with restrained section separators rather than cards inside cards. Findings remain compact rows; evidence remains tied to finding IDs and keeps direct values; verification items stay visibly separate from proven facts; actions retain P0/P1/P2, owner role, verification metric, pending state, and rollback feedback.

Wrap existing safe report HTML in a report article with a compact header containing “正式报告” and current generation/empty state. Do not parse report HTML into new KPI cards, do not add export behavior not already present, and do not modify report generation.

- [ ] **Step 4: Run insight, report, and contract suites**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts tests/insights/insight-client.test.ts tests/insights/insight-routes.test.ts tests/reports/reports.test.ts tests/contracts/public-contracts.test.ts`  
Expected: PASS; public DTOs, permissions, safe HTML, actions, and failure fallbacks are unchanged.

- [ ] **Step 5: Commit the formal reading slice**

```bash
git add src/components/luminax/workbench/InsightCanvas.tsx src/components/luminax/workbench/InsightActionPanel.tsx src/components/luminax/workbench/InsightFindingList.tsx src/components/luminax/workbench/InsightEvidenceSection.tsx src/components/luminax/workbench/InsightActionChecklist.tsx src/components/luminax/workbench/ReportView.tsx tests/workbench/workbench-client.test.ts tests/ui/product-shell.test.ts
git commit -m "feat: polish insight and report reading surfaces"
```

---

### Task 7: Modular Admin Visual System

**Files:**
- Create: `src/components/admin/AdminModuleNavigation.tsx`
- Modify: `src/components/admin/AdminShell.tsx`
- Modify: `src/components/admin/MetricRegistryPanel.tsx`
- Modify: `src/components/admin/PermissionManagementPanel.tsx`
- Modify: `src/components/admin/ReservedAdminModule.tsx`
- Modify: `tests/ui/product-shell.test.ts`
- Test: `tests/admin/metrics.test.ts`
- Test: `tests/admin/permissions.test.ts`

**Interfaces:**
- Produces: exported `AdminModule` type and `AdminModuleNavigation({ activeModule, onChange })`.
- Consumes: `ProductBrandBar`, existing metric and permission panels, and current client APIs.
- Preserves: super-admin page guard, localhost API guard, metric publication flow, permission simulator, and credential behavior.

- [ ] **Step 1: Add failing admin shell and reserved-module tests**

Add these imports and tests to `tests/ui/product-shell.test.ts`:

```ts
import { AdminShell } from "../../src/components/admin/AdminShell";
import { ReservedAdminModule } from "../../src/components/admin/ReservedAdminModule";

test("admin shell exposes modular navigation and work-focused content", () => {
  const html = renderToStaticMarkup(createElement(AdminShell, {
    user: { id: "admin", username: "admin", displayName: "系统管理员", role: "super_admin" },
  }));
  assert.match(html, /aria-label="管理模块"/);
  assert.match(html, /指标注册/);
  assert.match(html, /权限管理/);
  assert.match(html, /报表管理/);
  assert.match(html, /报表设置/);
  assert.match(html, /data-admin-layout="capability-navigation"/);
});

test("reserved admin modules use a table empty state", () => {
  const html = renderToStaticMarkup(createElement(ReservedAdminModule, { module: "reports" }));
  assert.match(html, /报表名称/);
  assert.match(html, /暂无配置/);
  assert.doesNotMatch(html, /功能即将上线|敬请期待/);
});
```

- [ ] **Step 2: Run admin UI and domain tests and verify failure**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/admin/metrics.test.ts tests/admin/permissions.test.ts`  
Expected: FAIL because the navigation component and stable admin layout marker do not exist.

- [ ] **Step 3: Extract navigation and normalize admin surfaces**

Move `AdminModule`, navigation item metadata, desktop sidebar, and mobile tab strip into `AdminModuleNavigation.tsx`. Keep the four current module IDs exactly unchanged. Use `ProductBrandBar` in `AdminShell`, retain the back, user, and logout commands, and mark the layout with `data-admin-layout="capability-navigation"`.

Normalize `MetricRegistryPanel` and `PermissionManagementPanel` with shared page header spacing, 44px primary controls, table-first lists, visible field labels, inline validation, and nonblocking save feedback. Do not change fetch URLs, payloads, SQL authoring behavior, permission policy values, password operations, or simulator semantics. Keep reserved report modules as honest disabled table states.

- [ ] **Step 4: Run admin, auth, and type tests**

Run: `pnpm exec tsx --test tests/ui/product-shell.test.ts tests/admin/metrics.test.ts tests/admin/permissions.test.ts tests/auth/auth.test.ts && pnpm run ts-check`  
Expected: PASS; metric, permission, and credential behavior remains unchanged.

- [ ] **Step 5: Commit the admin visual slice**

```bash
git add src/components/admin/AdminModuleNavigation.tsx src/components/admin/AdminShell.tsx src/components/admin/MetricRegistryPanel.tsx src/components/admin/PermissionManagementPanel.tsx src/components/admin/ReservedAdminModule.tsx tests/ui/product-shell.test.ts
git commit -m "feat: unify LuminaX admin experience"
```

---

### Task 8: Documentation, Responsive Verification, and Release Gate

**Files:**
- Modify: `DESIGN.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `tests/docs/documentation.test.ts`
- Modify only if browser evidence requires a correction: files changed in Tasks 1–7.

**Interfaces:**
- Documents: the implemented light-mode AI decision collaboration system, two active workbench templates, semantic color rules, responsive split, and unchanged service contracts.
- Preserves: all existing runbook commands and security guidance.

- [ ] **Step 1: Write failing documentation assertions for the new implemented state**

```ts
assertIncludesAll(design, [
  "AI 决策协同型",
  "决策协同区不展示洞察页的完整发现和证据",
  "黄色只用于主命令、当前选择、AI 决策焦点和待执行行动",
  "经营数据 / 决策协同",
  "1440×900",
  "390×844",
]);
assertIncludesAll(agents, [
  "`WorkbenchPresentationProfile` only changes display priority",
  "Role presentation cannot widen table, column, or store-value access",
]);
assertIncludesAll(readme, [
  "明亮模式 AI 决策协同工作台",
  "pnpm run verify",
]);
```

Remove documentation assertions that still describe the unified workbench as an unimplemented future phase.

- [ ] **Step 2: Run documentation tests and verify failure**

Run: `pnpm exec tsx --test tests/docs/documentation.test.ts`  
Expected: FAIL because `DESIGN.md`, `AGENTS.md`, and `README.md` still describe the older visual state.

- [ ] **Step 3: Update durable documentation to match the implementation**

Update `DESIGN.md` from target-only language to the implemented contract, document `regional_manager` as action-first and `default` as summary-first, and preserve the statement that template resolution cannot expand permissions. Update `AGENTS.md` with component boundaries and token discipline. Update `README.md` screenshots/usage prose only where it describes the old UI; do not add credentials or secrets.

- [ ] **Step 4: Run automated release verification**

Run:

```bash
pnpm exec tsx --test "tests/**/*.test.ts"
pnpm run ts-check
pnpm exec eslint . --quiet --ignore-pattern ".worktrees/**"
pnpm run build
```

Expected: all tests pass, TypeScript and ESLint exit 0, and Next.js generates all production routes.

- [ ] **Step 5: Start the production server and perform browser regression**

Run: `pnpm start` on port 5000 after stopping any stale LuminaX instance. Log in with the existing local admin account without recording its password in screenshots or documentation.

Verify at `1440×900`, `1280×720`, `1024×768`, and `390×844`:

- login submits, shows inline errors, and preserves username;
- desktop workbench shows one stable data/decision split;
- mobile switches between “经营数据” and “决策协同” with no horizontal overflow;
- store/date/compare scope remains functional;
- overview charts are nonblank and retain labels/tooltips;
- full chat responses remain readable after successful insight updates;
- “查看完整洞察” opens the formal insight view;
- insight scope restore and action checkbox behavior work;
- weekly report remains readable and permission-scoped;
- admin metric, permission, report, and settings navigation remains usable;
- keyboard focus is visible and interactive controls do not overlap.

Capture before/after screenshots for the workbench desktop, workbench mobile, login, and admin. Use canvas-pixel checks for ECharts so a visually blank canvas cannot pass by DOM presence alone.

- [ ] **Step 6: Commit the verified documentation state**

```bash
git add -- DESIGN.md AGENTS.md README.md tests/docs/documentation.test.ts
git commit -m "docs: publish LuminaX decision UI contract"
```

- [ ] **Step 7: Confirm clean release state**

Run: `git status --short --branch`  
Expected: clean working tree; branch contains only reviewed UI and documentation commits, with `.env*`, `.luminax/`, `.superpowers/`, credentials, API keys, and runtime logs untracked and uncommitted.
