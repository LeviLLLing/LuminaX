# LuminaX Unified Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mutually exclusive chat/dashboard/report frontend with a permission-driven, role-templated unified workbench that keeps business data and the AI assistant available in one responsive experience.

**Architecture:** Keep the existing data, report, chat streaming, intent, and Agent APIs intact. Add a fail-closed client context boundary and pure authorization/presentation selectors, then compose focused workbench components around the existing controller, charts, report HTML, and chat stream.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, ECharts, Lucide React, Node test runner through `tsx`.

## Global Constraints

- Preserve `/`, `/login`, `/admin`, `/api/data`, `/api/chat`, report APIs, authentication APIs, and current SSE semantics.
- Use `/api/workbench/context` as the only new workbench context endpoint; do not add another business API.
- Role templates may change defaults, ordering, emphasis, prompts, and empty-state copy, but may never grant permissions.
- Client filtering is a presentation boundary only; every server request remains server-authorized.
- Do not change database tables, fixed SQL metric execution, metric registration, Agent orchestration, MySQL, or SQL Server adapters.
- Desktop keeps data and AI visible together; mobile uses `经营数据 / 分析决策` switching from 360px upward.
- Use white/light grey surfaces, black/high-contrast text, and LuminaX yellow `#FFE600` for brand and primary actions.
- Keep cards at 8px radius or less and use existing Lucide icons with tooltips for unfamiliar icon-only actions.
- Add no new runtime dependency and no browser-test framework dependency.
- Keep automated coverage focused on context validation, authorization intersection, presentation selection, and existing regression tests.

---

## File Structure

### New domain and client boundary files

- `src/modules/workbench/workbench-context-client.ts`: validate and fetch the public workbench context without widening permissions.
- `src/modules/workbench/workbench-intent-policy.ts`: intersect AI intent metadata with the current workbench authorization.
- `src/modules/workbench/workbench-presentation.ts`: define insight views, visible dashboard sections, labels, template copy, and suggested questions.
- `src/hooks/use-workbench-context.ts`: own client context loading, retry, abort, and login redirect behavior.
- `tests/workbench/workbench-client.test.ts`: exercise fail-closed parsing, intent authorization, metric projection, and template presentation.

### New presentation components

- `src/components/luminax/workbench/WorkbenchShell.tsx`: desktop/tablet dual-core layout and mobile segmented switching.
- `src/components/luminax/workbench/WorkbenchHeader.tsx`: brand, identity, template label, admin capability, and logout.
- `src/components/luminax/workbench/ScopeBar.tsx`: authorized store, date, comparison, and available-metric controls.
- `src/components/luminax/workbench/InsightCanvas.tsx`: overview/analysis/report view composition.
- `src/components/luminax/workbench/OverviewPanel.tsx`: permission-aware KPI and chart rendering.
- `src/components/luminax/workbench/AnalysisPanel.tsx`: current AI analysis content plus the supporting data view.
- `src/components/luminax/workbench/ReportView.tsx`: sandboxed existing report HTML preview.
- `src/components/luminax/workbench/AssistantPanel.tsx`: persistent chat stream, suggestions, input, and send action.

### Modified files

- `src/hooks/use-sales-data.ts`: defer `/api/data` until context authorization is available and support retry/abort.
- `src/hooks/use-luminax-controller.ts`: use authorized stores, authorized intent metadata, and insight views.
- `src/hooks/use-chat-stream.ts`: allow a suggested question to be sent directly without changing the API protocol.
- `src/components/luminax/LuminaXApp.tsx`: become the unified workbench composition root.
- `src/app/globals.css`: replace the warm one-note base palette with neutral workbench tokens.
- `tests/module-interfaces.test.ts`: include the new workbench client tests.

### Removed after the new composition builds

- `src/components/luminax/AppHeader.tsx`
- `src/components/luminax/ChatPanel.tsx`
- `src/components/luminax/DashboardPanel.tsx`
- `src/components/luminax/ReportPanel.tsx`

---

### Task 1: Add the fail-closed client context boundary

**Files:**
- Create: `src/modules/workbench/workbench-context-client.ts`
- Create: `src/hooks/use-workbench-context.ts`
- Create: `tests/workbench/workbench-client.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Produces: `normalizeWorkbenchContext(payload: unknown): WorkbenchContext`
- Produces: `fetchWorkbenchContext(signal?: AbortSignal): Promise<WorkbenchContext>`
- Produces: `WorkbenchContextClientError` with a numeric `status` property.
- Produces: `useWorkbenchContext(): { context; error; isLoading; reload }`

- [ ] **Step 1: Write parsing tests that require safe fallback and reject malformed authorization data**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkbenchContextClientError,
  normalizeWorkbenchContext,
} from "../../src/modules/workbench/workbench-context-client";

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
```

- [ ] **Step 2: Import the test from the aggregate test entry and verify the test fails**

Add this import to `tests/module-interfaces.test.ts`:

```ts
import "./workbench/workbench-client.test";
```

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`
Expected: FAIL because `workbench-context-client.ts` does not exist.

- [ ] **Step 3: Implement exact public-payload validation and fetching**

Use a strict `zod` object containing only `templateId`, `availableStoreIds`, `availableMetricCodes`, `availableIntents`, and `canAccessAdmin`. Accept unknown template strings but normalize them to `default`; reject missing or invalid arrays, invalid intent names, extra policy fields, and non-boolean admin capability. Deduplicate arrays without inventing values.

```ts
const intentSchema = z.enum([
  "achievement_rate",
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "promotion_contribution",
  "refund_rate",
  "anomaly_detection",
  "compare",
  "attribution",
  "report",
  "custom_metric",
]);

const workbenchContextPayloadSchema = z
  .object({
    templateId: z.string(),
    availableStoreIds: z.array(z.string().min(1)),
    availableMetricCodes: z.array(z.string().min(1)),
    availableIntents: z.array(intentSchema),
    canAccessAdmin: z.boolean(),
  })
  .strict();

export class WorkbenchContextClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkbenchContextClientError";
  }
}

export function normalizeWorkbenchContext(payload: unknown): WorkbenchContext {
  const result = workbenchContextPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new WorkbenchContextClientError("工作台权限上下文无效", 500);
  }
  return {
    templateId:
      result.data.templateId === "regional_manager"
        ? "regional_manager"
        : "default",
    availableStoreIds: unique(result.data.availableStoreIds),
    availableMetricCodes: unique(result.data.availableMetricCodes),
    availableIntents: unique(result.data.availableIntents),
    canAccessAdmin: result.data.canAccessAdmin,
  };
}

export async function fetchWorkbenchContext(
  signal?: AbortSignal
): Promise<WorkbenchContext> {
  const response = await fetch("/api/workbench/context", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new WorkbenchContextClientError(
      response.status === 403 ? "当前账号没有工作台访问权限" : "工作台暂时不可用",
      response.status
    );
  }
  return normalizeWorkbenchContext(await response.json());
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
```

- [ ] **Step 4: Implement the hook with abort, retry, and authentication redirect**

```ts
export interface UseWorkbenchContextResult {
  context: WorkbenchContext | null;
  error: string | null;
  isLoading: boolean;
  reload(): void;
}

export function useWorkbenchContext(): UseWorkbenchContextResult {
  const [requestVersion, setRequestVersion] = useState(0);
  const [context, setContext] = useState<WorkbenchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchWorkbenchContext(controller.signal)
      .then(setContext)
      .catch((reason: unknown) => {
        if ((reason as Error).name === "AbortError") return;
        if (reason instanceof WorkbenchContextClientError && reason.status === 401) {
          window.location.replace("/login?next=/");
          return;
        }
        setContext(null);
        setError(reason instanceof Error ? reason.message : "工作台暂时不可用");
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [requestVersion]);

  return {
    context,
    error,
    isLoading,
    reload: () => setRequestVersion((value) => value + 1),
  };
}
```

- [ ] **Step 5: Run the focused test and type check**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`
Expected: PASS.
Run: `pnpm run ts-check`
Expected: PASS.

- [ ] **Step 6: Commit the client context boundary**

```bash
git add src/modules/workbench/workbench-context-client.ts src/hooks/use-workbench-context.ts tests/workbench/workbench-client.test.ts tests/module-interfaces.test.ts
git commit -m "feat: add workbench client context boundary"
```

---

### Task 2: Add authorized intent and presentation selectors

**Files:**
- Create: `src/modules/workbench/workbench-intent-policy.ts`
- Create: `src/modules/workbench/workbench-presentation.ts`
- Modify: `tests/workbench/workbench-client.test.ts`

**Interfaces:**
- Consumes: `WorkbenchContext` and existing `IntentViewMetadata`.
- Produces: `authorizeIntentMetadata(metadata, context): IntentViewMetadata | null`
- Produces: `InsightView = "overview" | "analysis" | "report"`
- Produces: `InsightSectionId` and `getVisibleInsightSections(metricCodes)`.
- Produces: `getWorkbenchCopy(templateId)` and `getSuggestedQuestions(context)`.

- [ ] **Step 1: Add failing tests for store intersection, unavailable intents, template copy, and visible sections**

```ts
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
```

`createClientContext()` returns a `regional_manager` context with `S001`, `achievement_rate`, `channel_mix`, and `compare`, but without `report`.

```ts
function createClientContext(): WorkbenchContext {
  return {
    templateId: "regional_manager",
    availableStoreIds: ["S001"],
    availableMetricCodes: ["achievement_rate", "channel_mix"],
    availableIntents: ["achievement_rate", "channel_mix", "compare"],
    canAccessAdmin: false,
  };
}
```

- [ ] **Step 2: Run the focused test to verify the new selectors are missing**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`
Expected: FAIL because the policy and presentation modules do not exist.

- [ ] **Step 3: Implement fail-closed intent authorization**

```ts
export function authorizeIntentMetadata(
  metadata: IntentViewMetadata,
  context: WorkbenchContext
): IntentViewMetadata | null {
  if (
    metadata.intent === "irrelevant" ||
    !context.availableIntents.includes(metadata.intent)
  ) {
    return null;
  }
  const requestedStoreIds = [...new Set(metadata.storeIds)];
  const storeIds = requestedStoreIds.filter((storeId) =>
    context.availableStoreIds.includes(storeId)
  );
  if (requestedStoreIds.length > 0 && storeIds.length === 0) return null;
  return { ...metadata, storeIds };
}
```

- [ ] **Step 4: Implement the presentation model**

Define `InsightSectionId` as `totalSales`, `achievement`, `orders`, `aov`, `salesTrend`, `channel`, `category`, `daypart`, and `refund`. Use a fixed metric-to-section mapping: achievement exposes sales/achievement/trend; order and AOV expose their KPI/trend; channel/daypart/refund expose their matching chart; compare/attribution/report expose the full relevant analysis set. Preserve deterministic order and deduplicate sections.

```ts
export type InsightView = "overview" | "analysis" | "report";
export type InsightSectionId =
  | "totalSales"
  | "achievement"
  | "orders"
  | "aov"
  | "salesTrend"
  | "channel"
  | "category"
  | "daypart"
  | "refund";

const SECTION_ORDER: readonly InsightSectionId[] = [
  "totalSales",
  "achievement",
  "orders",
  "aov",
  "salesTrend",
  "channel",
  "category",
  "daypart",
  "refund",
];

const METRIC_SECTIONS: Readonly<Record<string, readonly InsightSectionId[]>> = {
  achievement_rate: ["totalSales", "achievement", "salesTrend"],
  order_trend: ["orders", "salesTrend"],
  aov_trend: ["totalSales", "aov", "salesTrend"],
  channel_mix: ["channel"],
  daypart_analysis: ["daypart"],
  promotion_contribution: ["totalSales", "salesTrend"],
  refund_rate: ["totalSales", "refund"],
  anomaly_detection: ["totalSales", "orders", "aov", "salesTrend", "refund"],
  compare: SECTION_ORDER,
  attribution: SECTION_ORDER,
  report: SECTION_ORDER,
};

export function getVisibleInsightSections(
  metricCodes: readonly string[]
): InsightSectionId[] {
  const visible = new Set(
    metricCodes.flatMap((metricCode) => METRIC_SECTIONS[metricCode] ?? [])
  );
  return SECTION_ORDER.filter((section) => visible.has(section));
}

export function resolveInsightView(intent: AnalysisIntent): InsightView {
  if (intent === "report") return "report";
  if (intent === "irrelevant") return "overview";
  return "analysis";
}

export function getWorkbenchCopy(templateId: WorkbenchTemplateId) {
  return templateId === "regional_manager"
    ? { label: "区域经理模板", title: "辖区经营概览" }
    : { label: "通用模板", title: "经营决策工作台" };
}
```

Use a fixed prompt map keyed by `WorkbenchIntent`; return the first three prompts following `context.availableIntents` order. Display unknown custom metric codes as their code rather than fabricating a label.

```ts
const INTENT_PROMPTS: Record<WorkbenchIntent, string> = {
  achievement_rate: "分析当前范围的销售达成率",
  order_trend: "分析当前范围的订单趋势",
  aov_trend: "分析当前范围的客单价趋势",
  channel_mix: "分析当前范围的渠道结构",
  daypart_analysis: "分析当前范围的分时段表现",
  promotion_contribution: "分析促销活动的销售贡献",
  refund_rate: "分析退款率和主要风险",
  anomaly_detection: "识别当前范围的经营异常",
  compare: "对比当前范围内的门店表现",
  attribution: "归因分析当前经营表现",
  report: "生成当前范围的经营周报",
  custom_metric: "分析可用的自定义指标",
};

export function getSuggestedQuestions(context: WorkbenchContext): string[] {
  return context.availableIntents
    .map((intent) => INTENT_PROMPTS[intent])
    .slice(0, 3);
}

const METRIC_LABELS: Readonly<Record<string, string>> = {
  achievement_rate: "销售达成率",
  order_trend: "订单趋势",
  aov_trend: "客单价趋势",
  channel_mix: "渠道结构",
  daypart_analysis: "时段表现",
  promotion_contribution: "促销贡献",
  refund_rate: "退款率",
  anomaly_detection: "异常检测",
  compare: "门店对比",
  attribution: "经营归因",
  report: "经营周报",
};

export function getMetricLabel(metricCode: string): string {
  return METRIC_LABELS[metricCode] ?? metricCode;
}
```

- [ ] **Step 5: Run focused tests and type checking**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`
Expected: PASS.
Run: `pnpm run ts-check`
Expected: PASS.

- [ ] **Step 6: Commit the policy and presentation model**

```bash
git add src/modules/workbench/workbench-intent-policy.ts src/modules/workbench/workbench-presentation.ts tests/workbench/workbench-client.test.ts
git commit -m "feat: add authorized workbench presentation model"
```

---

### Task 3: Constrain data loading and controller state to the workbench context

**Files:**
- Modify: `src/hooks/use-sales-data.ts`
- Modify: `src/hooks/use-luminax-controller.ts`

**Interfaces:**
- Consumes: `WorkbenchContext | null` from Task 1.
- Consumes: `authorizeIntentMetadata` and `resolveInsightView` from Task 2.
- Produces: `useSalesData(enabled: boolean)` with `{ salesData, loading, error, reload }`.
- Produces: `useLuminaXController(context?)` with `insightView`, `authorizedStores`, data error/retry, and existing chart/report values. The optional form is a temporary compatibility bridge removed in Task 6.

- [ ] **Step 1: Change sales loading to wait for authorization and support abort/retry**

```ts
export function useSalesData(enabled: boolean) {
  const [requestVersion, setRequestVersion] = useState(0);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/data", { cache: "no-store", signal: controller.signal })
      .then(readSalesDataResponse)
      .then(setSalesData)
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError("经营数据暂时不可用");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, requestVersion]);

  return {
    salesData,
    loading,
    error,
    reload: () => setRequestVersion((value) => value + 1),
  };
}

async function readSalesDataResponse(response: Response): Promise<SalesData> {
  if (response.status === 401) {
    window.location.replace("/login?next=/");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error("Data request failed");
  return response.json() as Promise<SalesData>;
}
```

Keep the existing `401` redirect in `readSalesDataResponse`.

- [ ] **Step 2: Make the controller context-aware and keep only authorized stores active**

```ts
export function useLuminaXController(context?: WorkbenchContext | null) {
  const { salesData, loading, error, reload } = useSalesData(context !== null);
  const [insightView, setInsightView] = useState<InsightView>("overview");

  const authorizedStores = useMemo(() => {
    if (!salesData || context === null) return [];
    if (context === undefined) return salesData.store_master;
    return salesData.store_master.filter((store) =>
      context.availableStoreIds.includes(store.store_id)
    );
  }, [context, salesData]);

  const activeStoreIds = useMemo(() => {
    const allowedIds = authorizedStores.map((store) => store.store_id);
    if (compareStores.length > 0) {
      return compareStores.filter((storeId) => allowedIds.includes(storeId));
    }
    return selectedStore === "all" && allowedIds.length > 0
      ? allowedIds
      : allowedIds.includes(selectedStore)
        ? [selectedStore]
        : [];
  }, [authorizedStores, compareStores, selectedStore]);
```

Add an effect that removes revoked comparison stores and resets an invalid selected store to `all`.

- [ ] **Step 3: Authorize AI metadata before changing filters or views**

```ts
const applyIntentMetadata = useCallback(
  (metadata: IntentViewMetadata) => {
    if (context === null) return;
    const authorized =
      context === undefined
        ? metadata
        : authorizeIntentMetadata(metadata, context);
    if (!authorized) return;
    const nextView = resolveInsightView(authorized.intent);

    if (nextView === "report") {
      if (salesData) {
        setReportHTML(
          generateWeeklyReportHTML(
            salesData,
            authorized.startDate,
            authorized.endDate
          )
        );
        setInsightView("report");
        setViewMode("report");
      }
      return;
    }

    if (authorized.storeIds.length >= 2) {
      setCompareStores(authorized.storeIds);
      setSelectedStore("all");
    } else if (authorized.storeIds.length === 1) {
      setCompareStores([]);
      setSelectedStore(authorized.storeIds[0]);
    }
    setStartDate(authorized.startDate);
    setEndDate(authorized.endDate);
    setInsightView(nextView);
    setViewMode(nextView === "analysis" ? "dashboard" : "chat");
  },
  [context, salesData]
);
```

Return `authorizedStores`, `insightView`, `setInsightView`, `error`, and `reload` alongside the existing chart, summary, report, filter, and data values. Keep the legacy `viewMode` state and output during this task so the old presentation continues to compile; remove it only when Task 6 replaces the composition.

- [ ] **Step 4: Verify controller compilation and existing domain tests**

Run: `pnpm run ts-check`
Expected: PASS.
Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts tests/workbench/workbench.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the context-aware controller**

```bash
git add src/hooks/use-sales-data.ts src/hooks/use-luminax-controller.ts
git commit -m "refactor: constrain workbench controller state"
```

---

### Task 4: Build the workbench shell, header, and scope controls

**Files:**
- Create: `src/components/luminax/workbench/WorkbenchShell.tsx`
- Create: `src/components/luminax/workbench/WorkbenchHeader.tsx`
- Create: `src/components/luminax/workbench/ScopeBar.tsx`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `WorkbenchContext`, authorized stores, dates, and comparison state.
- Produces: responsive slots `dataPanel` and `assistantPanel`.
- Produces: scope callbacks compatible with `useLuminaXController` setters.

- [ ] **Step 1: Implement the responsive shell with stable desktop and mobile modes**

```ts
interface WorkbenchShellProps {
  header: ReactNode;
  scopeBar: ReactNode;
  dataPanel: ReactNode;
  assistantPanel: ReactNode;
}

type MobilePane = "data" | "assistant";

export function WorkbenchShell(props: WorkbenchShellProps) {
  const [mobilePane, setMobilePane] = useState<MobilePane>("data");
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-[#f5f6f7]">
      {props.header}
      <MobilePaneSwitch value={mobilePane} onChange={setMobilePane} />
      <div
        className={cn(
          "grid min-h-0 flex-1",
          assistantCollapsed
            ? "md:grid-cols-[minmax(0,1fr)_48px]"
            : "md:grid-cols-[minmax(0,1fr)_minmax(280px,38%)] lg:grid-cols-[minmax(0,2.1fr)_minmax(320px,1fr)]"
        )}
      >
        <section className={mobilePane === "data" ? "flex min-h-0 flex-col" : "hidden min-h-0 md:flex md:flex-col"}>
          {props.scopeBar}
          {props.dataPanel}
        </section>
        <aside className={mobilePane === "assistant" ? "flex min-h-0 flex-col" : "hidden min-h-0 flex-col md:flex"}>
          <AssistantCollapseButton
            collapsed={assistantCollapsed}
            onClick={() => setAssistantCollapsed((value) => !value)}
          />
          <div className={assistantCollapsed ? "hidden" : "flex min-h-0 flex-1"}>
            {props.assistantPanel}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MobilePaneSwitch({
  value,
  onChange,
}: {
  value: MobilePane;
  onChange(value: MobilePane): void;
}) {
  return (
    <div className="grid grid-cols-2 border-b border-[#dedfe2] bg-white p-1 md:hidden">
      <button type="button" aria-pressed={value === "data"} onClick={() => onChange("data")}>
        经营数据
      </button>
      <button type="button" aria-pressed={value === "assistant"} onClick={() => onChange("assistant")}>
        分析决策
      </button>
    </div>
  );
}

function AssistantCollapseButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick(): void;
}) {
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <button
      type="button"
      title={collapsed ? "展开分析决策" : "收起分析决策"}
      aria-label={collapsed ? "展开分析决策" : "收起分析决策"}
      onClick={onClick}
      className="hidden size-9 place-items-center self-end border-l border-b border-[#dedfe2] bg-white md:grid"
    >
      <Icon className="size-4" />
    </button>
  );
}
```

Use `assistantCollapsed` only from tablet width upward, with Lucide `PanelRightClose`/`PanelRightOpen` icon buttons and tooltips. A collapsed assistant becomes a fixed icon rail rather than unmounting the panel.

- [ ] **Step 2: Implement the bright capability-driven header**

```ts
interface WorkbenchHeaderProps {
  user: AuthenticatedUser;
  context: WorkbenchContext;
}
```

Render `LuminaX` as the first brand signal, `getWorkbenchCopy(context.templateId).label`, the user display name, admin `Settings` link only when `context.canAccessAdmin`, and the existing `LogoutButton`. Use a white header, a 3px `#FFE600` bottom brand line, black text, 36px icon targets, and no role-name permission inference.

- [ ] **Step 3: Implement the permission-aware scope bar**

```ts
interface ScopeBarProps {
  stores: StoreMaster[];
  availableMetricCodes: string[];
  selectedStore: string;
  compareStores: string[];
  startDate: string;
  endDate: string;
  onSelectedStoreChange(value: string): void;
  onCompareStoresChange(value: string[]): void;
  onStartDateChange(value: string): void;
  onEndDateChange(value: string): void;
}
```

Use a native store `select`, date inputs, a `DropdownMenu` with checkbox items for comparison stores, and a read-only metric menu listing `getMetricLabel(code)`. Selecting the primary store clears comparison mode. Comparison checkboxes may only emit IDs present in `stores`. Disable comparison when fewer than two stores are available.

- [ ] **Step 4: Run lint and type checking for the new components**

Run: `pnpm exec eslint src/components/luminax/workbench/WorkbenchShell.tsx src/components/luminax/workbench/WorkbenchHeader.tsx src/components/luminax/workbench/ScopeBar.tsx --quiet`
Expected: PASS.
Run: `pnpm run ts-check`
Expected: old `LuminaXApp` may still report the known `viewMode` migration errors; the three new components must be error-free.

- [ ] **Step 5: Commit the workbench frame**

```bash
git add src/components/luminax/workbench/WorkbenchShell.tsx src/components/luminax/workbench/WorkbenchHeader.tsx src/components/luminax/workbench/ScopeBar.tsx
git commit -m "feat: add responsive workbench frame"
```

---

### Task 5: Build the permission-aware insight canvas

**Files:**
- Create: `src/components/luminax/workbench/InsightCanvas.tsx`
- Create: `src/components/luminax/workbench/OverviewPanel.tsx`
- Create: `src/components/luminax/workbench/AnalysisPanel.tsx`
- Create: `src/components/luminax/workbench/ReportView.tsx`

**Interfaces:**
- Consumes: `InsightView`, `WorkbenchTemplateId`, authorized metric codes, summary, chart options, report HTML, latest AI content, and streaming state.
- Produces: overview, analysis, and report views without resetting shared scope or chat state.

- [ ] **Step 1: Implement the insight canvas view navigation**

```ts
interface InsightCanvasProps {
  view: InsightView;
  templateId: WorkbenchTemplateId;
  availableMetricCodes: string[];
  dataSummary: DataSummary | null;
  chartOptions: DashboardChartOptions;
  reportHTML: string;
  analysisContent: string;
  isAnalyzing: boolean;
  onViewChange(view: InsightView): void;
}
```

Render compact tabs for `经营概览`, `经营分析`, and `经营周报`. Disable the report tab while `reportHTML` is empty. Keep tabs and headings smaller than page-level brand text. Select `OverviewPanel`, `AnalysisPanel`, or `ReportView` based on `view`.

- [ ] **Step 2: Move existing KPI and ECharts rendering into the overview panel**

Use `getVisibleInsightSections(availableMetricCodes)` to conditionally render cards and charts. Keep chart containers at a stable `280px` height, use one column by default and two columns from extra-large widths, and use at most 8px radius.

```ts
const sections = new Set(getVisibleInsightSections(availableMetricCodes));

return (
  <div className="grid gap-4 p-4 sm:p-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {sections.has("totalSales") && <KpiCard label="总销售额" value={`¥${formatCompactNumber(dataSummary.salesSummary.totalSales)}`} />}
      {sections.has("achievement") && <KpiCard label="目标达成率" value={dataSummary.salesSummary.achievementRate} />}
      {sections.has("orders") && <KpiCard label="订单量" value={formatCompactNumber(dataSummary.salesSummary.totalOrders)} />}
      {sections.has("aov") && <KpiCard label="客单价" value={`¥${dataSummary.salesSummary.avgOrderValue}`} />}
    </div>
    {sections.has("salesTrend") && <ChartCard title="销售趋势" option={chartOptions.salesTrend} wide />}
    <div className="grid gap-4 xl:grid-cols-2">
      {sections.has("channel") && <ChartCard title="渠道销售分布" option={chartOptions.channel} />}
      {sections.has("category") && <ChartCard title="品类销售分布" option={chartOptions.category} />}
      {sections.has("daypart") && <ChartCard title="时段销售分布" option={chartOptions.daypart} />}
      {sections.has("refund") && <ChartCard title="退款趋势" option={chartOptions.refund} />}
    </div>
  </div>
);

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-[#dedfe2] bg-white p-4">
      <p className="truncate text-xs font-medium text-[#666a73]">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-[#17181a]">{value}</p>
    </article>
  );
}

function ChartCard({
  title,
  option,
  wide = false,
}: {
  title: string;
  option: ChartOption;
  wide?: boolean;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-[#dedfe2] bg-white p-4", wide && "xl:col-span-2")}>
      <h3 className="mb-3 text-sm font-semibold text-[#17181a]">{title}</h3>
      <div className="h-[280px] min-w-0">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </section>
  );
}
```

When no section is available, render a neutral empty state stating `当前账号暂无可展示指标` and do not query a wider scope.

- [ ] **Step 3: Implement AI analysis and report views**

`AnalysisPanel` renders the latest assistant answer through the existing `MarkdownRenderer`; while streaming with empty content it shows stable skeleton rows. Under the answer, render the permission-filtered `OverviewPanel` as supporting evidence, without nesting the entire page in another card.

`ReportView` uses the existing sandbox contract:

```tsx
<iframe
  srcDoc={reportHTML}
  className="h-full min-h-[640px] w-full border-0"
  title="经营周报"
  sandbox="allow-scripts allow-same-origin"
/>
```

- [ ] **Step 4: Lint and type-check the insight components**

Run: `pnpm exec eslint src/components/luminax/workbench/InsightCanvas.tsx src/components/luminax/workbench/OverviewPanel.tsx src/components/luminax/workbench/AnalysisPanel.tsx src/components/luminax/workbench/ReportView.tsx --quiet`
Expected: PASS.
Run: `pnpm run ts-check`
Expected: only old composition migration errors may remain.

- [ ] **Step 5: Commit the insight canvas**

```bash
git add src/components/luminax/workbench/InsightCanvas.tsx src/components/luminax/workbench/OverviewPanel.tsx src/components/luminax/workbench/AnalysisPanel.tsx src/components/luminax/workbench/ReportView.tsx
git commit -m "feat: add permission-aware insight canvas"
```

---

### Task 6: Add the persistent assistant and switch the application composition

**Files:**
- Create: `src/components/luminax/workbench/AssistantPanel.tsx`
- Modify: `src/hooks/use-chat-stream.ts`
- Modify: `src/components/luminax/LuminaXApp.tsx`
- Modify: `src/app/globals.css`
- Delete: `src/components/luminax/AppHeader.tsx`
- Delete: `src/components/luminax/ChatPanel.tsx`
- Delete: `src/components/luminax/DashboardPanel.tsx`
- Delete: `src/components/luminax/ReportPanel.tsx`

**Interfaces:**
- Consumes: chat messages, current input, streaming state, suggestions, and existing scroll ref.
- Produces: `onSendMessage(question?: string)` so suggestions and typed input share the same stream path.
- Composes: context -> controller -> shell -> scope/insight/assistant.

- [ ] **Step 1: Allow direct submission of a suggestion without changing the chat API**

Change the hook callback to:

```ts
const sendMessage = useCallback(
  async (questionOverride?: string) => {
    const question = (questionOverride ?? inputValue).trim();
    if (!question || isStreaming) return;
    setInputValue("");
    setMessages((previous) => [
      ...previous,
      { role: "user", content: question },
      { role: "ai", content: "", isLoading: true },
    ]);
    setIsStreaming(true);

    try {
      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      setMessages((previous) =>
        replaceLastMessage(previous, { role: "ai", content: "", isLoading: false })
      );
      const receivedIntent = await streamChatMessage(
        { question, sessionId },
        {
          onIntent: onIntentMetadata,
          onContent: (content) => {
            setMessages((previous) =>
              replaceLastMessage(previous, { role: "ai", content, isLoading: false })
            );
          },
        },
        abortController.signal
      );
      if (receivedIntent && shouldAppendModeActivation(receivedIntent)) {
        setMessages((previous) => [
          ...previous,
          { role: "system", content: `${getIntentModeLabel(receivedIntent)}模式已激活` },
        ]);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message =
          error instanceof ChatStreamError && error.status < 500
            ? error.message
            : "AI 服务暂时不可用，请稍后重试。";
        setMessages((previous) =>
          replaceLastMessage(previous, {
            role: "ai",
            content: `*${message}*`,
            isLoading: false,
          })
        );
      }
    } finally {
      setIsStreaming(false);
      streamAbortRef.current = null;
    }
  },
  [inputValue, isStreaming, onIntentMetadata, sessionId]
);
```

Keep `{ question, sessionId }`, SSE event handling, abort behavior, system activation messages, and user-visible error semantics unchanged.

- [ ] **Step 2: Implement the persistent bright assistant panel**

```ts
interface AssistantPanelProps {
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  suggestions: string[];
  chatAreaRef: RefObject<HTMLDivElement | null>;
  onInputChange(value: string): void;
  onSendMessage(question?: string): void;
}
```

Render a stable header, the first three authorized template suggestions, the existing markdown message stream, a text input, and a Lucide `Send` icon button with tooltip. Suggestions call `onSendMessage(suggestion)` directly. Use neutral message surfaces, yellow only for the AI identity/primary action, and status colors only for system/error messages.

- [ ] **Step 3: Replace `LuminaXApp` with the complete workbench composition**

```ts
export function LuminaXApp({ user }: { user: AuthenticatedUser }) {
  const workbench = useWorkbenchContext();
  const controller = useLuminaXController(workbench.context);
  const chat = useChatStream({ onIntentMetadata: controller.applyIntentMetadata });

  if (workbench.isLoading || (workbench.context && controller.loading)) {
    return <WorkbenchLoadingState />;
  }
  if (!workbench.context || workbench.error) {
    return <WorkbenchErrorState message={workbench.error} onRetry={workbench.reload} />;
  }
  if (controller.error || !controller.salesData) {
    return <WorkbenchErrorState message={controller.error} onRetry={controller.reload} />;
  }

  const suggestions = getSuggestedQuestions(workbench.context);
  const latestAssistantMessage = [...chat.messages]
    .reverse()
    .find((message) => message.role === "ai");

  return (
    <WorkbenchShell
      header={<WorkbenchHeader user={user} context={workbench.context} />}
      scopeBar={
        <ScopeBar
          stores={controller.authorizedStores}
          availableMetricCodes={workbench.context.availableMetricCodes}
          selectedStore={controller.selectedStore}
          compareStores={controller.compareStores}
          startDate={controller.startDate}
          endDate={controller.endDate}
          onSelectedStoreChange={controller.setSelectedStore}
          onCompareStoresChange={controller.setCompareStores}
          onStartDateChange={controller.setStartDate}
          onEndDateChange={controller.setEndDate}
        />
      }
      dataPanel={
        <InsightCanvas
          view={controller.insightView}
          templateId={workbench.context.templateId}
          availableMetricCodes={workbench.context.availableMetricCodes}
          dataSummary={controller.dataSummary}
          chartOptions={controller.chartOptions}
          reportHTML={controller.reportHTML}
          analysisContent={latestAssistantMessage?.content ?? ""}
          isAnalyzing={chat.isStreaming}
          onViewChange={controller.setInsightView}
        />
      }
      assistantPanel={
        <AssistantPanel
          messages={chat.messages}
          inputValue={chat.inputValue}
          isStreaming={chat.isStreaming}
          suggestions={suggestions}
          chatAreaRef={chat.chatAreaRef}
          onInputChange={chat.setInputValue}
          onSendMessage={chat.sendMessage}
        />
      }
    />
  );
}
```

Add these local states beneath `LuminaXApp`:

```tsx
function WorkbenchLoadingState() {
  return (
    <div className="grid h-dvh place-items-center bg-[#f5f6f7]">
      <div className="text-center">
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-4 border-[#FFE600] border-t-[#17181a]" />
        <p className="text-sm text-[#666a73]">正在加载工作台...</p>
      </div>
    </div>
  );
}

function WorkbenchErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry(): void;
}) {
  return (
    <div className="grid h-dvh place-items-center bg-[#f5f6f7] p-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto mb-3 size-6 text-red-600" />
        <p className="text-sm text-[#44474d]">{message ?? "工作台暂时不可用"}</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-[#FFE600] px-4 py-2 text-sm font-semibold text-black">
          重新加载
        </button>
      </div>
    </div>
  );
}
```

Do not introduce React context or a new global state library. After this composition no longer imports the old components, make the controller parameter required as `context: WorkbenchContext | null`, remove the temporary `context === undefined` compatibility branches, and remove the legacy `viewMode` state and output.

- [ ] **Step 4: Apply neutral product tokens and remove the superseded components**

Set the light root tokens to neutral white/light grey surfaces, near-black text, neutral borders, exact `#FFE600` primary, and black primary foreground. Keep red/green/blue chart/status colors distinct. Set `--radius` to `0.5rem`. Preserve markdown table/code styles and retain the dark token block for compatibility even though the workbench is light-first.

Delete the four old presentation components only after `rg -n "AppHeader|ChatPanel|DashboardPanel|ReportPanel" src` confirms there are no imports outside those files.

- [ ] **Step 5: Run focused tests, full validation, and production build**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts tests/workbench/workbench.test.ts`
Expected: PASS.
Run: `pnpm run validate`
Expected: all existing and new tests, TypeScript, and quiet lint pass.
Run: `pnpm run build`
Expected: Next.js production build succeeds with `/`, `/login`, `/admin`, `/api/data`, `/api/chat`, and `/api/workbench/context` present.

- [ ] **Step 6: Run concise browser smoke checks**

Start: `pnpm run dev`
Open: `http://localhost:5000/login?next=/`
Verify with the existing local accounts and database:

1. Login reaches `/` and loads the unified workbench.
2. Desktop at 1440x900 shows scope/data and assistant simultaneously.
3. Store and date changes update the data view without losing chat state.
4. An AI comparison or attribution request updates only authorized stores and opens analysis view.
5. A report request opens the report view without hiding the assistant.
6. A 360x800 viewport uses `经营数据 / 分析决策`, has no page-level horizontal overflow, and preserves state across switching.
7. Admin link appears only when `canAccessAdmin` is true.

Inspect screenshots for blank charts, clipped text, overlapping controls, unstable dimensions, and unreadable contrast. Do not add a Playwright dependency for this check.

- [ ] **Step 7: Commit the unified application**

```bash
git add src/components/luminax src/hooks/use-chat-stream.ts src/app/globals.css
git commit -m "feat: deliver unified LuminaX workbench"
```

---

## Final Verification

- [ ] Run `git diff --check` and expect no whitespace errors.
- [ ] Run `pnpm run validate` and expect all automated checks to pass.
- [ ] Run `pnpm run build` and expect a successful production build.
- [ ] Confirm `git status --short` contains only intentionally generated local runtime files, which must remain untracked and outside commits.
- [ ] Keep the verified development server running and report its actual local URL.
- [ ] Request code review before merging the implementation branch.
