# Insight And Action Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将重复的“经营分析”页升级为按用户持久化的“洞察与行动”工作区，使有效分析自动沉淀为可追溯发现、确定性证据、待核查项和可勾选行动，同时保持现有聊天、周报、权限和 SQL 指标链路兼容。

**Architecture:** 固定 SQL 仍是唯一数值来源，业务 Agent 在授权计算完成后通过一个可选的 `onAnalysisReady` 端口把结构化结果交给洞察应用层。洞察应用层用无记忆的 DeepSeek `InsightComposer` 选择和撰写文本，用确定性的 `EvidenceBuilder` 构造数值证据，验证后原子替换当前用户的一份最新快照；失败时旧快照不变并回退到原有完整聊天回答。读取和行动更新通过独立 API 再次校验用户、表、字段和门店权限，前端只消费去除权限元数据的 DTO。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5、Node.js test runner、Tailwind CSS 4、ECharts 6、DeepSeek `AgentModel`、文件仓储 `.luminax/latest-insights.json`。

## Global Constraints

- 保留 Governance、Business、Attribution 三个 Agent 的职责、独立模型、独立记忆和现有 Prompt；`InsightComposer` 不是 Agent，不拥有记忆。
- 固定指标和自定义指标的数值仍由 SQL 计算；模型不得计算、改写或补造任何展示数值。
- 仅 `order_trend`、`aov_trend`、`channel_mix`、`daypart_analysis`、`promotion_contribution`、`refund_rate`、`anomaly_detection`、`compare`、`attribution` 触发洞察。
- `achievement_rate`、`custom_metric`、`report`、`irrelevant`、治理拒绝、无数据、权限失败和业务失败不更新洞察。
- 洞察成功时聊天只返回简短回执；洞察生成、校验或保存失败时发送 `insight: failed` 并继续原有完整回答。
- 每个用户只保存一份最新洞察，不实现历史、协作、通知、审批、自动执行动作或管理后台配置。
- 服务端保存完整 `accessRequirements`，客户端 DTO 不包含 `userId`、`accessRequirements` 或 `sourceFingerprint`。
- 读取快照时重新校验完整表、字段和门店权限；任一要求不满足时返回 `403`，不裁剪后展示。
- 文件写入使用进程内写队列和同目录临时文件 `rename`；损坏文件不得被空数据覆盖。
- 同一用户并行分析以服务端开始时间和请求 ID 判定新旧，旧请求不得覆盖新请求。
- 经营概览和经营周报保持原样；分析页不复用完整 `OverviewPanel`。
- UI 使用现有明亮运营工作台风格、Lucide 图标、最大 `8px` 圆角，并在 `360px` 及以上宽度无重叠和横向溢出。
- 不提交 `.env.local`、`.luminax/`、`.superpowers/`、API Key、数据库密码、Cookie 或运行日志；System Prompt 只存在于受版本管理的专用源文件，不写入日志或运行态数据。

---

## File Structure

### New domain and application files

- `src/modules/insights/insight-types.ts`: 服务端快照、客户端 DTO、生成草稿、流事件和错误类型。
- `src/modules/insights/insight-trigger-policy.ts`: 规范化意图到“是否生成洞察”的唯一决策表。
- `src/modules/insights/insight-source-catalog.ts`: 从各固定 SQL 返回结构中提取受控数值事实与证据候选。
- `src/modules/insights/evidence-builder.ts`: 将选中的证据候选确定性转换为 `InsightEvidence`。
- `src/modules/insights/insight-composer.ts`: 调用无记忆 DeepSeek，只生成文本和候选 ID 选择。
- `src/modules/insights/insight-validator.ts`: 校验数量、ID 引用、自由文本数字、数值来源和 DTO 投影。
- `src/modules/insights/latest-insight-repository.ts`: 仓储端口、文件实现、原子写入和乐观并发。
- `src/modules/insights/insight-generation-guard.ts`: 同用户并行请求的新旧判定。
- `src/modules/insights/insight-application.ts`: 生成、保存、重新授权读取和行动更新用例。
- `src/modules/insights/insight-composition.ts`: DeepSeek、仓储、权限和 SQL 门店查询的运行时装配。
- `src/modules/agents/prompts/insight-composer-system-prompt.ts`: 洞察文本选择器的独立系统提示。
- `src/modules/insights/insight-client.ts`: GET/PATCH 客户端与响应校验。
- `src/modules/insights/insight-chart-options.ts`: 从证据 DTO 构造确定性 ECharts option。
- `src/hooks/use-latest-insight.ts`: 最新快照加载、生成状态和行动乐观更新。
- `src/components/luminax/workbench/InsightActionPanel.tsx`: 洞察页状态和六段信息结构的容器。
- `src/components/luminax/workbench/InsightFindingList.tsx`: 关键发现和证据定位入口。
- `src/components/luminax/workbench/InsightEvidenceSection.tsx`: 支持证据、解释和图表。
- `src/components/luminax/workbench/InsightActionChecklist.tsx`: 建议型行动清单。
- `src/app/api/insights/latest/route.ts`: 当前用户最新洞察 GET。
- `src/app/api/insights/latest/actions/[actionId]/route.ts`: 行动状态 PATCH。
- `tests/insights/insight-types.test.ts`: 触发策略和公共 DTO 契约。
- `tests/insights/latest-insight-repository.test.ts`: 替换、恢复、损坏和冲突测试。
- `tests/insights/insight-generation.test.ts`: 来源目录、证据、模型草稿和数值校验测试。
- `tests/insights/insight-application.test.ts`: 生成顺序、并发、读取权限和行动更新测试。
- `tests/insights/insight-routes.test.ts`: GET/PATCH HTTP 契约测试。
- `tests/insights/insight-client.test.ts`: SSE、客户端请求、图表和范围工具测试。

### Existing files to modify

- `src/modules/agents/business/business-agent.ts`: 暴露授权后的内部分析上下文，并在生成完整回答前调用可选投影端口。
- `src/modules/chat/chat-stream.ts`: 新增内部 `emitInsight` 回调及事件联合类型。
- `src/modules/chat/chat-application.ts`: 创建请求令牌、调用洞察投影、实现成功回执和静默回退。
- `src/modules/chat/chat-http-adapter.ts`: 将洞察事件编码为 SSE，保持现有事件不变。
- `src/modules/chat/chat-stream-client.ts`: 解析并分发洞察 SSE 事件。
- `src/modules/chat/chat-composition.ts`: 注入 `insightApplication` 和独立 Composer 模型。
- `src/hooks/use-chat-stream.ts`: 把洞察状态传给页面，不把完整分析重复追加到聊天。
- `src/hooks/use-luminax-controller.ts`: 暴露当前范围并提供显式 `applyInsightScope`。
- `src/components/luminax/LuminaXApp.tsx`: 协调聊天、最新洞察、自动切换和范围恢复。
- `src/components/luminax/workbench/InsightCanvas.tsx`: 页签更名并以 `InsightActionPanel` 替换 `AnalysisPanel`。
- `src/modules/workbench/workbench-presentation.ts`: 新增范围比较和洞察页文案选择器。
- `tests/chat/chat.test.ts`: 成功回执、失败回退和 SSE 顺序测试。
- `tests/contracts/public-contracts.test.ts`: 新事件不破坏既有 SSE 合同。
- `tests/workbench/workbench-client.test.ts`: 客户端范围与界面状态测试。
- `tests/module-interfaces.test.ts`: 注册新增测试文件。
- `AGENTS.md`、`docs/architecture.md`: 同步洞察模块、SSE 和运行时仓储边界。

---

### Task 1: Lock The Insight Domain Contract And Trigger Policy

**Files:**
- Create: `src/modules/insights/insight-types.ts`
- Create: `src/modules/insights/insight-trigger-policy.ts`
- Create: `tests/insights/insight-types.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: `AnalysisIntent` from `src/modules/domain/analysis-types.ts`; `DataAccessRequirement` from `src/modules/admin/permissions/permission-types.ts`.
- Produces: `InsightSnapshot`, `InsightSnapshotDto`, `InsightDraft`, `InsightStreamEvent`, `InsightScope`, `InsightEvidence`, `toInsightSnapshotDto(snapshot)`, and `shouldGenerateInsight(intent)`.

- [ ] **Step 1: Write the failing trigger and DTO tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldGenerateInsight,
  TRIGGERING_INSIGHT_INTENTS,
} from "../../src/modules/insights/insight-trigger-policy";
import {
  toInsightSnapshotDto,
  type InsightSnapshot,
} from "../../src/modules/insights/insight-types";

test("only meaningful analysis intents trigger an insight", () => {
  assert.deepEqual(TRIGGERING_INSIGHT_INTENTS, [
    "order_trend",
    "aov_trend",
    "channel_mix",
    "daypart_analysis",
    "promotion_contribution",
    "refund_rate",
    "anomaly_detection",
    "compare",
    "attribution",
  ]);
  for (const intent of TRIGGERING_INSIGHT_INTENTS) {
    assert.equal(shouldGenerateInsight(intent), true);
  }
  for (const intent of [
    "achievement_rate",
    "custom_metric",
    "report",
    "irrelevant",
  ] as const) {
    assert.equal(shouldGenerateInsight(intent), false);
  }
});

test("public DTO removes server-only identity and permission fields", () => {
  const snapshot = createInsightSnapshotFixture();
  const dto = toInsightSnapshotDto(snapshot);
  assert.equal("userId" in dto, false);
  assert.equal("accessRequirements" in dto, false);
  assert.equal("sourceFingerprint" in dto, false);
  assert.equal(dto.id, snapshot.id);
  assert.equal(dto.findings[0].displayValue, "-12.4%");
});
```

The fixture in this file must contain one finding, one evidence item, one verification item, and one action so every nested contract is exercised.

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `pnpm exec tsx --test tests/insights/insight-types.test.ts`

Expected: FAIL with `Cannot find module '../../src/modules/insights/insight-trigger-policy'`.

- [ ] **Step 3: Implement the exact domain types and trigger table**

Use these public shapes in `insight-types.ts`:

```ts
export type InsightSeverity = "high" | "medium" | "low" | "positive";
export type InsightConfidence = "high" | "medium" | "needs_verification";
export type InsightEvidenceType =
  | "store_target_variance"
  | "period_variance"
  | "anomaly_dates"
  | "channel_contribution"
  | "category_contribution"
  | "daypart_contribution"
  | "metric_drivers";
export type InsightOwnerRole =
  | "区域经理"
  | "店长"
  | "运营"
  | "财务"
  | "数据分析";

export interface InsightScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
  comparisonLabel: string | null;
}

export interface InsightFinding {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  subjectIds: string[];
  metricCode: string;
  value: number;
  unit: string;
  displayValue: string;
  evidenceIds: string[];
}

export interface InsightEvidenceSeries {
  key: string;
  label: string;
  value: number;
  baseline?: number;
  direction: "positive" | "negative" | "neutral";
}

export interface InsightEvidence {
  id: string;
  type: InsightEvidenceType;
  title: string;
  supportsFindingIds: string[];
  unit: string;
  baselineLabel: string;
  series: InsightEvidenceSeries[];
  interpretation: string;
}

export interface InsightVerificationItem {
  id: string;
  observedFact: string;
  hypothesis: string;
  requiredCheck: string;
}

export interface InsightAction {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  ownerRole: InsightOwnerRole;
  verificationMetricCode: string;
  verificationMetricLabel: string;
  completed: boolean;
  completedAt: string | null;
}

export interface InsightSnapshot {
  id: string;
  userId: string;
  sourceQuestion: string;
  sourceIntent: string;
  scope: InsightScope;
  headline: string;
  findings: InsightFinding[];
  evidence: InsightEvidence[];
  verificationItems: InsightVerificationItem[];
  actions: InsightAction[];
  accessRequirements: DataAccessRequirement[];
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export type InsightSnapshotDto = Omit<
  InsightSnapshot,
  "userId" | "accessRequirements" | "sourceFingerprint"
>;

export type InsightStreamEvent =
  | { status: "generating" }
  | { status: "updated"; insightId: string; findingCount: number; actionCount: number }
  | { status: "failed" };
```

Define the model draft so it can select only authoritative source IDs and cannot supply numeric values:

```ts
export interface InsightDraft {
  headline: string;
  findings: Array<{
    sourceId: string;
    title: string;
    summary: string;
    severity: InsightSeverity;
    confidence: InsightConfidence;
    evidenceIds: string[];
  }>;
  verificationItems: Array<{
    observedFact: string;
    hypothesis: string;
    requiredCheck: string;
  }>;
  actions: Array<{
    priority: "P0" | "P1" | "P2";
    title: string;
    ownerRole: InsightOwnerRole;
    verificationMetricCode: string;
  }>;
}
```

`toInsightSnapshotDto` must return a `structuredClone` of only the client fields. In `insight-trigger-policy.ts`, export the literal list shown in the test and implement membership with a `ReadonlySet<AnalysisIntent>`.

- [ ] **Step 4: Register and run the tests**

Add `import "./insights/insight-types.test";` to `tests/module-interfaces.test.ts`.

Run: `pnpm exec tsx --test tests/insights/insight-types.test.ts && pnpm run ts-check`

Expected: both commands PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add src/modules/insights/insight-types.ts src/modules/insights/insight-trigger-policy.ts tests/insights/insight-types.test.ts tests/module-interfaces.test.ts
git commit -m "feat: define insight workspace contracts"
```

---

### Task 2: Add The Atomic Latest-Insight Repository And Generation Guard

**Files:**
- Create: `src/modules/insights/latest-insight-repository.ts`
- Create: `src/modules/insights/insight-generation-guard.ts`
- Create: `tests/insights/latest-insight-repository.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: `InsightSnapshot` and `InsightAction` from Task 1.
- Produces: `LatestInsightRepository`, `FileLatestInsightRepository`, `InsightNotFoundError`, `InsightConflictError`, `InsightRepositoryCorruptError`, `InsightGenerationGuard`, and `InsightGenerationToken`.

- [ ] **Step 1: Write repository and concurrency tests**

```ts
test("repository replaces and restores one latest snapshot per user", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "luminax-insights-")), "latest.json");
  const repository = new FileLatestInsightRepository(file);
  await repository.replaceForUser(createSnapshot({ id: "old", userId: "u1" }));
  await repository.replaceForUser(createSnapshot({ id: "new", userId: "u1" }));
  await repository.replaceForUser(createSnapshot({ id: "other", userId: "u2" }));
  assert.equal((await repository.findByUserId("u1"))?.id, "new");
  assert.equal((await new FileLatestInsightRepository(file).findByUserId("u2"))?.id, "other");
});

test("action update requires the current insight id", async () => {
  const repository = await createRepositoryWithSnapshot("current");
  await assert.rejects(
    repository.updateActionState("u1", "stale", "action-1", true),
    InsightConflictError
  );
  const updated = await repository.updateActionState(
    "u1",
    "current",
    "action-1",
    true
  );
  assert.equal(updated.actions[0].completed, true);
  assert.ok(updated.actions[0].completedAt);
});

test("corrupt JSON is reported and never overwritten", async () => {
  const file = await createFileContaining("{broken");
  const repository = new FileLatestInsightRepository(file);
  await assert.rejects(repository.findByUserId("u1"), InsightRepositoryCorruptError);
  await assert.rejects(
    repository.replaceForUser(createSnapshot({ id: "new", userId: "u1" })),
    InsightRepositoryCorruptError
  );
  assert.equal(await readFile(file, "utf8"), "{broken");
});

test("a newer request token invalidates an older token for the same user", () => {
  const guard = new InsightGenerationGuard();
  const oldToken = { userId: "u1", requestId: "old", startedAt: 10 };
  const newToken = { userId: "u1", requestId: "new", startedAt: 20 };
  assert.equal(guard.claim(oldToken), true);
  assert.equal(guard.claim(newToken), true);
  assert.equal(guard.isCurrent(oldToken), false);
  assert.equal(guard.isCurrent(newToken), true);
});
```

Also test: unknown user returns `null`; unknown action throws `InsightNotFoundError`; equal timestamps use lexical request ID as a deterministic tie-breaker; replacing the same `sourceFingerprint` returns the existing snapshot without changing timestamps.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `pnpm exec tsx --test tests/insights/latest-insight-repository.test.ts`

Expected: FAIL because `latest-insight-repository.ts` does not exist.

- [ ] **Step 3: Implement the repository port and file format**

```ts
interface LatestInsightRegistryFile {
  version: 1;
  insights: Record<string, InsightSnapshot>;
}

export interface LatestInsightRepository {
  findByUserId(userId: string): Promise<InsightSnapshot | null>;
  replaceForUser(snapshot: InsightSnapshot): Promise<InsightSnapshot>;
  updateActionState(
    userId: string,
    insightId: string,
    actionId: string,
    completed: boolean
  ): Promise<InsightSnapshot>;
}
```

`FileLatestInsightRepository` must default to `process.env.LUMINAX_LATEST_INSIGHTS_PATH || join(process.cwd(), ".luminax", "latest-insights.json")`. Every public read returns `structuredClone`; every write runs through one promise queue. `writeRegistry` writes `${filePath}.${process.pid}.${randomUUID()}.tmp`, then calls `rename(tempPath, filePath)`, and removes the temp file only when the rename fails. Parsing or shape validation failures throw `InsightRepositoryCorruptError` before any write is attempted.

For `updateActionState`, set `completedAt` to `new Date().toISOString()` only when `completed === true`, otherwise set it to `null`; update the snapshot `updatedAt` in the same write. Use `InsightConflictError` for an `insightId` mismatch and `InsightNotFoundError` for a missing snapshot or action.

- [ ] **Step 4: Implement deterministic request ordering**

```ts
export interface InsightGenerationToken {
  userId: string;
  requestId: string;
  startedAt: number;
}

export class InsightGenerationGuard {
  private readonly latest = new Map<string, InsightGenerationToken>();

  claim(token: InsightGenerationToken): boolean {
    const current = this.latest.get(token.userId);
    if (current && compareTokens(token, current) < 0) return false;
    this.latest.set(token.userId, token);
    return true;
  }

  isCurrent(token: InsightGenerationToken): boolean {
    const current = this.latest.get(token.userId);
    return Boolean(
      current &&
      current.requestId === token.requestId &&
      current.startedAt === token.startedAt
    );
  }
}
```

`compareTokens` compares `startedAt` first, then `requestId` with `localeCompare`.

- [ ] **Step 5: Register and run repository tests**

Add `import "./insights/latest-insight-repository.test";` to `tests/module-interfaces.test.ts`.

Run: `pnpm exec tsx --test tests/insights/latest-insight-repository.test.ts && pnpm run ts-check`

Expected: both commands PASS and temporary test directories are removed in `test.afterEach`.

- [ ] **Step 6: Commit the persistence boundary**

```bash
git add src/modules/insights/latest-insight-repository.ts src/modules/insights/insight-generation-guard.ts tests/insights/latest-insight-repository.test.ts tests/module-interfaces.test.ts
git commit -m "feat: persist latest user insights"
```

---

### Task 3: Build Deterministic Evidence And The Bounded DeepSeek Composer

**Files:**
- Create: `src/modules/insights/insight-source-catalog.ts`
- Create: `src/modules/insights/evidence-builder.ts`
- Create: `src/modules/insights/insight-composer.ts`
- Create: `src/modules/insights/insight-validator.ts`
- Create: `src/modules/agents/prompts/insight-composer-system-prompt.ts`
- Create: `tests/insights/insight-generation.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: `AnalysisIntent`, authorized fixed-SQL `analysisData`, `AgentModel`, `extractJsonObject`, and Task 1 types.
- Produces: `InsightSourceCatalog`, `InsightFindingSource`, `InsightEvidenceCandidate`, `InsightEvidenceLink`, `buildInsightSourceCatalog(input)`, `buildInsightEvidence(candidates, links)`, `createInsightComposer({ model })`, `materializeInsightSnapshot(input)`, and `InsightValidationError`.

- [ ] **Step 1: Write failing source, evidence, composer, and validation tests**

Use fixed fixtures shaped exactly like `MySqlSqlMetricQueryExecutor` results. The core assertions are:

```ts
test("compare data becomes store variance and contribution evidence", () => {
  const catalog = buildInsightSourceCatalog({
    intent: "compare",
    analysisData: compareFixture,
  });
  assert.ok(catalog.findingSources.some((item) => item.metricCode === "achievement_rate"));
  assert.ok(catalog.evidenceCandidates.some((item) => item.type === "store_target_variance"));
  assert.ok(catalog.evidenceCandidates.some((item) => item.type === "category_contribution"));
});

test("evidence values are copied from SQL data and never from the draft", () => {
  const evidence = buildInsightEvidence(catalog.evidenceCandidates, [{
    findingId: "finding-1",
    evidenceIds: ["compare-store-performance"],
  }]);
  assert.deepEqual(evidence[0].series.map((item) => item.value), [88.2, 103.1]);
});

test("composer has no memory and returns only a bounded draft", async () => {
  const model = new FakeAgentModel(JSON.stringify(validDraft));
  const composer = createInsightComposer({ model });
  const result = await composer.compose(composerInput);
  assert.equal(result.findings.length, 3);
  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].temperature, 0.1);
});

test("model-authored digits and unknown source ids reject the snapshot", () => {
  assert.throws(
    () => materializeInsightSnapshot({ ...input, draft: { ...draft, headline: "销售下降 20%" } }),
    InsightValidationError
  );
  assert.throws(
    () => materializeInsightSnapshot({ ...input, draft: draftWithUnknownSource }),
    InsightValidationError
  );
});
```

Add one source-catalog assertion for every triggering intent. The intent-to-source map is fixed as follows:

| Intent | Finding sources | Evidence candidates |
| --- | --- | --- |
| `order_trend` | `totalOrders`, `orderAchievementRate`, `trendPct` per store | `period_variance`, `metric_drivers` |
| `aov_trend` | `avgAOV`, `targetAOV`, `aovGap`, `trendPct` per store | `period_variance`, `metric_drivers` |
| `channel_mix` | each `channelPct` item and per-store channel values | `channel_contribution` |
| `daypart_analysis` | each `daypartPct` item and per-store daypart values | `daypart_contribution` |
| `promotion_contribution` | `contributionRate`, `totalDiscount`, top promotions and by-store values | `metric_drivers`, `store_target_variance` |
| `refund_rate` | `refundRate`, `cancelRate`, daily and by-store values | `metric_drivers`, `anomaly_dates` |
| `anomaly_detection` | `anomalyCount` and each anomaly day | `anomaly_dates`, `metric_drivers` |
| `compare` | per-store sales, target, achievement, orders, AOV and refund | `store_target_variance`, `channel_contribution`, `category_contribution`, `daypart_contribution` |
| `attribution` | sales summary, decomposition, factor contributions and breakdowns | `period_variance`, `metric_drivers`, channel/category/daypart contributions, optional store variance |

- [ ] **Step 2: Run the focused test and confirm missing-module failures**

Run: `pnpm exec tsx --test tests/insights/insight-generation.test.ts`

Expected: FAIL on the first missing insights module import.

- [ ] **Step 3: Implement the deterministic source catalog**

Use these internal contracts:

```ts
export interface InsightFindingSource {
  id: string;
  metricCode: string;
  label: string;
  value: number;
  unit: string;
  displayValue: string;
  subjectIds: string[];
  evidenceCandidateIds: string[];
}

export interface InsightEvidenceCandidate {
  id: string;
  type: InsightEvidenceType;
  title: string;
  unit: string;
  baselineLabel: string;
  series: InsightEvidenceSeries[];
  interpretationFacts: string[];
}

export interface InsightEvidenceLink {
  findingId: string;
  evidenceIds: string[];
}

export function buildInsightEvidence(
  candidates: readonly InsightEvidenceCandidate[],
  links: readonly InsightEvidenceLink[]
): InsightEvidence[];

export interface InsightSourceCatalog {
  findingSources: InsightFindingSource[];
  evidenceCandidates: InsightEvidenceCandidate[];
  verificationMetricLabels: Record<string, string>;
}
```

Implement an exhaustive `switch (input.intent)` for the nine triggering intents. Numeric coercion accepts only finite JavaScript numbers already present in `analysisData`; numeric strings, missing paths, `NaN`, and infinities are skipped. IDs must be stable slugs derived from intent, metric path, and subject ID, not random UUIDs. Formatting rules are deterministic: currency uses `zh-CN` with `¥` and at most two decimals, percentages append `%` with at most one decimal, counts use integer grouping, and ratios use at most two decimals.

`interpretationFacts` contains only server-built clauses using `displayValue`; it is not supplied by the model. If the catalog cannot produce at least three finding sources and one non-empty evidence candidate, throw `InsightValidationError` so chat can use its normal fallback.

- [ ] **Step 4: Implement the Composer prompt and parser**

`INSIGHT_COMPOSER_SYSTEM_PROMPT` must require one JSON object, 3-5 findings, 0-3 verification items, 2-5 actions, only IDs and enum values supplied by the prompt, and no Arabic digits in `headline`, finding `title`/`summary`, verification text, or action titles. It must explicitly state that SQL facts are authoritative and that the model may not add values, units, dates, percentages, rankings, IDs, HTML, JavaScript, Markdown tables, or database details.

```ts
export interface InsightComposer {
  compose(input: {
    question: string;
    intent: AnalysisIntent;
    scope: InsightScope;
    catalog: InsightSourceCatalog;
    attributionNarrative?: string | null;
  }): Promise<InsightDraft>;
}

export function createInsightComposer({ model }: { model: AgentModel }): InsightComposer;
```

Call `model.complete` with the dedicated system prompt, one user message containing serialized scope plus candidate IDs/labels, `temperature: 0.1`, and no `AgentMemory`. Parse with `extractJsonObject`; missing/invalid JSON throws `InsightValidationError("INVALID_MODEL_OUTPUT")`. Pass only the optional attribution narrative, never any Agent history, permissions, credentials, Prompt text, SQL, or connection configuration.

- [ ] **Step 5: Materialize and validate the final snapshot**

`materializeInsightSnapshot` must:

1. Reject numeric claims in model-authored prose with `containsNumericClaim`: reject ASCII/full-width digits and currency/percentage symbols using `/[0-9０-９%％¥￥]/`; reject rankings with `/第[零〇一二两三四五六七八九十百千万亿]+/`; reject Chinese-number quantities with `/(?:零|〇|一|二|两|三|四|五|六|七|八|九|十|百|千|万|亿|点)+(?:元|单|笔|家|店|天|日|周|月|年|成|倍|个)/`. This applies only to free prose, not controlled IDs, enum properties or server-copied `displayValue`.
2. Require 3-5 unique findings and 2-5 actions.
3. Resolve every `sourceId` from `catalog.findingSources` and copy `metricCode`, `value`, `unit`, `displayValue`, and `subjectIds` from that source.
4. Resolve every evidence ID from `catalog.evidenceCandidates`, reject empty series, and construct `supportsFindingIds` from actual finding references.
5. Require every finding to reference at least one materialized evidence item; a finding needing field verification may additionally create an `InsightVerificationItem` but cannot omit evidence for its observed fact.
6. Resolve `verificationMetricLabel` only from `catalog.verificationMetricLabels`.
7. Assign server IDs with `randomUUID`, initialize actions to `completed: false`, and set both timestamps from one injected `now()` value.
8. Build `sourceFingerprint` with SHA-256 over canonical JSON containing user ID, intent, sorted store IDs, dates, and the source catalog; do not include raw question or model prose.

`buildInsightEvidence` copies candidate series and joins `interpretationFacts` into `interpretation`; model prose cannot enter chart series, units, baselines or interpretations.

- [ ] **Step 6: Register and run generation tests**

Add `import "./insights/insight-generation.test";` to `tests/module-interfaces.test.ts`.

Run: `pnpm exec tsx --test tests/insights/insight-generation.test.ts && pnpm run ts-check`

Expected: both commands PASS.

- [ ] **Step 7: Commit the bounded generation pipeline**

```bash
git add src/modules/insights/insight-source-catalog.ts src/modules/insights/evidence-builder.ts src/modules/insights/insight-composer.ts src/modules/insights/insight-validator.ts src/modules/agents/prompts/insight-composer-system-prompt.ts tests/insights/insight-generation.test.ts tests/module-interfaces.test.ts
git commit -m "feat: compose validated insight evidence"
```

---

### Task 4: Integrate Insight Projection Before Full Chat Answer Generation

**Files:**
- Create: `src/modules/insights/insight-application.ts`
- Create: `src/modules/insights/insight-composition.ts`
- Create: `tests/insights/insight-application.test.ts`
- Modify: `src/modules/agents/business/business-agent.ts`
- Modify: `src/modules/chat/chat-stream.ts`
- Modify: `src/modules/chat/chat-application.ts`
- Modify: `src/modules/chat/chat-http-adapter.ts`
- Modify: `src/modules/chat/chat-composition.ts`
- Modify: `tests/agents/agents.test.ts`
- Modify: `tests/chat/chat.test.ts`
- Modify: `tests/contracts/public-contracts.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: Task 1-3 contracts, `BusinessAgent`, `AttributionAgent`, `AccessControl`, `SqlMetricQueryExecutor`, and existing SSE callbacks.
- Produces: `BusinessAnalysisContext`, `BusinessResponseOverride`, `InsightApplication`, `InsightRequestToken`, `StaleInsightGenerationError`, and the additive `ChatStreamCallbacks.emitInsight(event)` protocol.

- [ ] **Step 1: Write failing business orchestration tests**

Add tests proving all four paths:

```ts
test("business agent offers authorized SQL data before calling its answer model", async () => {
  let answerModelCalls = 0;
  const agent = createBusinessAgentWithSqlResult({
    intent: "compare",
    onModelComplete: () => { answerModelCalls += 1; },
  });
  const result = await agent.execute({
    sessionId: "s1",
    question: "对比门店表现",
    onAnalysisReady: async (analysis) => {
      assert.equal(analysis.intent, "compare");
      assert.equal(analysis.accessRequirements[0].tableName, "store_master");
      assert.deepEqual(analysis.storeIds, ["S001", "S002"]);
      assert.ok(analysis.analysisData);
      return { content: "洞察已更新" };
    },
  });
  assert.equal(result.content, "洞察已更新");
  assert.equal(answerModelCalls, 0);
});

test("a null projection keeps the existing full-answer path", async () => {
  const streamContent: string[] = [];
  const result = await agent.execute({
    sessionId: "s1",
    question: "分析订单趋势",
    onAnalysisReady: async () => null,
    stream: createTestStream({ emitContent: (value) => streamContent.push(value) }),
  });
  assert.equal(result.content, "完整业务回答");
  assert.deepEqual(streamContent, ["完整业务回答"]);
});
```

For attribution, assert the Attribution Agent is invoked exactly once before `onAnalysisReady`, its returned narrative is available as `analysis.attributionNarrative`, a successful projection skips the Business model, and a failed projection returns the already generated attribution answer.

- [ ] **Step 2: Write failing application, concurrency, and SSE tests**

```ts
test("successful generation saves before emitting updated and returns a receipt", async () => {
  const events: string[] = [];
  const application = createChatApplication({ governanceAgent, businessAgent, insightApplication });
  const result = await application.execute({
    userId: "u1",
    question: "分析异常原因",
    stream: createTestStream({
      emitInsight: (event) => events.push(event.status),
    }),
  });
  assert.deepEqual(events, ["generating", "updated"]);
  assert.match(result.content, /洞察与行动已更新/);
  assert.doesNotMatch(result.content, /完整业务分析正文/);
});

test("generation failure emits failed, preserves old insight, and streams the full answer", async () => {
  const events: string[] = [];
  const content: string[] = [];
  const result = await failingApplication.execute({
    userId: "u1",
    question: "分析异常原因",
    stream: createTestStream({
      emitInsight: (event) => events.push(event.status),
      emitContent: (delta) => content.push(delta),
    }),
  });
  assert.deepEqual(events, ["generating", "failed"]);
  assert.equal(result.content, "完整业务分析正文");
  assert.deepEqual(content, ["完整业务分析正文"]);
  assert.equal((await repository.findByUserId("u1"))?.id, "old-insight");
});

test("older concurrent analysis cannot overwrite the newer request", async () => {
  const oldToken = application.beginRequest("u1", "old", 10);
  const newToken = application.beginRequest("u1", "new", 20);
  await application.generateForAnalysis(newToken, newAnalysis);
  await assert.rejects(
    application.generateForAnalysis(oldToken, oldAnalysis),
    StaleInsightGenerationError
  );
  assert.equal((await repository.findByUserId("u1"))?.sourceQuestion, "new");
});
```

Also assert that non-triggering intents emit no insight event and do not call the Composer, and that `updated` is never emitted before `replaceForUser` resolves.

- [ ] **Step 3: Add the internal Business Agent projection port**

Add these contracts to `business-agent.ts`:

```ts
export interface BusinessAnalysisContext {
  question: string;
  intent: AnalysisIntent;
  analysisData: Record<string, unknown>;
  attributionNarrative: string | null;
  fallbackContent: string;
  storeIds: string[];
  startDate: string;
  endDate: string;
  accessRequirements: DataAccessRequirement[];
}

export interface BusinessResponseOverride {
  content: string;
}

export interface BusinessAgentRequest extends GovernanceHandoff {
  userId?: string;
  storeIds?: string[];
  startDate?: string;
  endDate?: string;
  stream?: ChatStreamCallbacks;
  onAnalysisReady?: (
    analysis: BusinessAnalysisContext
  ) => Promise<BusinessResponseOverride | null>;
}
```

After fixed SQL execution and attribution comparison enrichment:

1. Build the existing deterministic `fallbackContent`.
2. For `attribution`, call `attributionAgent.analyze` exactly once. When `onAnalysisReady` exists, pass `NOOP_CHAT_STREAM` so a later successful projection cannot leak the full narrative into Chat SSE; otherwise preserve the current stream argument.
3. If `analysisData` is non-null, call `onAnalysisReady` with a cloned `FIXED_METRIC_ACCESS_REQUIREMENTS[metricIntent]`.
4. When it returns an override, remember the user question and receipt in Business memory and return immediately without calling `generateBusinessAnswer`.
5. When it returns `null`, use the already generated attribution narrative or the existing `generateBusinessAnswer` path.

Do not call the projection port for custom metrics, irrelevant input, out-of-scope input, missing SQL data, or errors.

- [ ] **Step 4: Implement the insight application use cases**

```ts
export type InsightRequestToken = InsightGenerationToken;

export interface InsightApplication {
  beginRequest(userId: string, requestId?: string, startedAt?: number): InsightRequestToken;
  generateForAnalysis(
    token: InsightRequestToken,
    analysis: BusinessAnalysisContext
  ): Promise<InsightSnapshot>;
  getLatest(userId: string): Promise<InsightSnapshotDto | null>;
  updateAction(input: {
    userId: string;
    insightId: string;
    actionId: string;
    completed: boolean;
  }): Promise<InsightSnapshotDto>;
}
```

`generateForAnalysis` must call `guard.claim(token)` before model work and `guard.isCurrent(token)` immediately before `replaceForUser`. It builds the catalog, invokes the Composer, materializes the snapshot, and writes only after all validation passes. `getLatest` and `updateAction` authorization are completed in Task 5; in this task they may delegate to injected `authorizeSnapshot(snapshot)` so application tests can verify call ordering without HTTP.

`beginRequest` only captures and returns `{ userId, requestId, startedAt }`; it does not claim the guard. The first `guard.claim(token)` occurs inside `generateForAnalysis`, so governance rejection and non-triggering requests cannot invalidate an in-flight insight. A rejected claim or failed final `isCurrent` check throws `StaleInsightGenerationError` and never writes.

`buildInsightReceipt(snapshot)` returns deterministic short text containing the number of findings and actions plus two follow-up prompts derived from the first finding and scope, without reproducing finding summaries or evidence values.

- [ ] **Step 5: Extend the additive SSE callbacks**

```ts
export interface ChatStreamCallbacks {
  emitStatus(status: ChatStatus): void;
  emitReasoning(delta: string): void;
  emitContent(delta: string): void;
  emitInsight(event: InsightStreamEvent): void;
}
```

Add a no-op implementation to `NOOP_CHAT_STREAM`. In `chat-http-adapter.ts`, encode this callback as:

```ts
emitInsight: (event) =>
  queue.push(encodeEvent({ type: "insight", ...event })),
```

Do not change the existing `status`, `content`, `intent`, or `error` payloads.

- [ ] **Step 6: Wire ChatApplication success and silent fallback**

Add optional `insightApplication?: InsightApplication` to `ChatApplicationDependencies`. At the start of an authenticated execution, capture one token using the normalized user ID, `randomUUID()`, and `Date.now()`, but do not claim its generation guard. Pass `onAnalysisReady` to Business Agent only when the application exists; only the triggering branch below calls `generateForAnalysis` and claims it:

```ts
onAnalysisReady: async (analysis) => {
  if (!shouldGenerateInsight(analysis.intent)) return null;
  stream.emitInsight({ status: "generating" });
  try {
    const snapshot = await insightApplication.generateForAnalysis(token, analysis);
    stream.emitInsight({
      status: "updated",
      insightId: snapshot.id,
      findingCount: snapshot.findings.length,
      actionCount: snapshot.actions.length,
    });
    return { content: buildInsightReceipt(snapshot) };
  } catch (error) {
    console.error(
      "Insight projection failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    stream.emitInsight({ status: "failed" });
    return null;
  }
},
```

Never log the question, model output, analysis data, permissions, SQL, or credentials.

- [ ] **Step 7: Compose the runtime with a separate model instance**

In `insight-composition.ts`, create:

```ts
const insightComposer = createInsightComposer({
  model: new DeepSeekChatModel({
    model:
      process.env.DEEPSEEK_INSIGHT_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      "deepseek-v4-flash",
  }),
});
```

Use one `FileLatestInsightRepository`, one `InsightGenerationGuard`, the existing `accessControl`, and an injected `listStoreIds` backed by `MySqlSqlMetricQueryExecutor`. Export one `insightApplication`, then inject it into `createChatApplication` in `chat-composition.ts`. Do not create `AgentMemory` for the Composer.

- [ ] **Step 8: Run orchestration and contract tests**

Register `tests/insights/insight-application.test.ts`. Run:

```bash
pnpm exec tsx --test tests/agents/agents.test.ts tests/chat/chat.test.ts tests/insights/insight-application.test.ts tests/contracts/public-contracts.test.ts
pnpm run ts-check
```

Expected: all tests PASS. Existing tests may need `emitInsight() {}` added to inline `ChatStreamCallbacks` fixtures; no existing wire payload assertion may change except for new tests that explicitly exercise insight events.

- [ ] **Step 9: Commit the server orchestration**

```bash
git add src/modules/agents/business/business-agent.ts src/modules/chat/chat-stream.ts src/modules/chat/chat-application.ts src/modules/chat/chat-http-adapter.ts src/modules/chat/chat-composition.ts src/modules/insights/insight-application.ts src/modules/insights/insight-composition.ts tests/agents/agents.test.ts tests/chat/chat.test.ts tests/contracts/public-contracts.test.ts tests/insights/insight-application.test.ts tests/module-interfaces.test.ts
git commit -m "feat: project business analysis into insights"
```

---

### Task 5: Enforce Snapshot Permissions Through Authenticated APIs

**Files:**
- Create: `src/app/api/insights/latest/route.ts`
- Create: `src/app/api/insights/latest/actions/[actionId]/route.ts`
- Create: `tests/insights/insight-routes.test.ts`
- Modify: `src/modules/insights/insight-application.ts`
- Modify: `src/modules/insights/insight-composition.ts`
- Modify: `tests/contracts/public-contracts.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: `authenticateRequest`, `unauthenticatedResponse`, `AccessControl.authorizeScope`, `LatestInsightRepository`, `SqlMetricQueryExecutor.listStoreIds`, and Task 1 DTO.
- Produces: `GET /api/insights/latest`, `PATCH /api/insights/latest/actions/:actionId`, and injectable route factories for contract tests.

- [ ] **Step 1: Write failing GET and PATCH route tests**

```ts
test("latest insight GET requires login and disables caching", async () => {
  const unauthenticated = await createGetLatestInsightHandler({
    authenticate: async () => null,
    getLatest: async () => { throw new Error("must not run"); },
  })(new NextRequest("http://localhost/api/insights/latest"));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");

  const empty = await createGetLatestInsightHandler({
    authenticate: async () => user,
    getLatest: async () => null,
  })(new NextRequest("http://localhost/api/insights/latest"));
  assert.deepEqual(await empty.json(), { insight: null });
});

test("action PATCH validates identity, insight id, action id and boolean", async () => {
  const response = await createPatchInsightActionHandler({
    authenticate: async () => user,
    updateAction: async (input) => {
      assert.deepEqual(input, {
        userId: "u1",
        insightId: "insight-1",
        actionId: "action-1",
        completed: true,
      });
      return insightDto;
    },
  })(createPatchRequest({ insightId: "insight-1", completed: true }), {
    params: Promise.resolve({ actionId: "action-1" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { insight: insightDto });
});
```

Cover `400` for malformed body, `401` unauthenticated, `403` `DataAccessDeniedError`, `404` `InsightNotFoundError`, `409` `InsightConflictError`, `500` repository failure without internal detail, and `Cache-Control: no-store` on every response.

- [ ] **Step 2: Run route tests and confirm missing exports**

Run: `pnpm exec tsx --test tests/insights/insight-routes.test.ts`

Expected: FAIL because route factories do not exist.

- [ ] **Step 3: Implement full-snapshot reauthorization**

In `insight-application.ts`, implement one private `authorizeSnapshot(userId, snapshot)` function:

```ts
const availableStoreIds = await listStoreIds();
const scope = await accessControl.authorizeScope({
  userId,
  requirements: snapshot.accessRequirements,
  requestedStoreIds: snapshot.scope.storeIds,
  availableStoreIds,
  strictStoreScope: true,
});
if (!sameStringSet(scope.storeIds, snapshot.scope.storeIds)) {
  throw new DataAccessDeniedError();
}
```

`getLatest` reads only by the authenticated user ID, returns `null` before authorization when absent, authorizes the full stored requirements and exact store set, then calls `toInsightSnapshotDto`. `updateAction` reads and authorizes first, calls repository update with user/insight/action IDs, then returns the DTO. It never accepts analysis data, permissions or user ID from an HTTP body.

- [ ] **Step 4: Implement injectable route handlers**

`GET` uses `createGetLatestInsightHandler({ authenticate, getLatest })`. `PATCH` uses `createPatchInsightActionHandler({ authenticate, updateAction })` and accepts exactly:

```ts
interface UpdateInsightActionBody {
  insightId: string;
  completed: boolean;
}
```

Reject bodies whose keys are not exactly `insightId` and `completed`, reject empty/wrong-type values through explicit checks, and trim `insightId` and `actionId`; map the errors listed in Step 1; log only the error class/name for unexpected failures. Set `dynamic = "force-dynamic"` and `Cache-Control: no-store`.

- [ ] **Step 5: Run API and public-contract tests**

Register `tests/insights/insight-routes.test.ts`, add one public-contract assertion that the response JSON contains no `userId`, `accessRequirements`, or `sourceFingerprint`, then run:

```bash
pnpm exec tsx --test tests/insights/insight-routes.test.ts tests/contracts/public-contracts.test.ts
pnpm run ts-check
```

Expected: all tests PASS.

- [ ] **Step 6: Commit authenticated insight APIs**

```bash
git add src/app/api/insights/latest/route.ts "src/app/api/insights/latest/actions/[actionId]/route.ts" src/modules/insights/insight-application.ts src/modules/insights/insight-composition.ts tests/insights/insight-routes.test.ts tests/contracts/public-contracts.test.ts tests/module-interfaces.test.ts
git commit -m "feat: secure latest insight APIs"
```

---

### Task 6: Add Client State, SSE Handling, And Scope Coordination

**Files:**
- Create: `src/modules/insights/insight-client.ts`
- Create: `src/hooks/use-latest-insight.ts`
- Create: `src/modules/insights/insight-chart-options.ts`
- Create: `tests/insights/insight-client.test.ts`
- Modify: `src/modules/chat/chat-stream-client.ts`
- Modify: `src/hooks/use-chat-stream.ts`
- Modify: `src/hooks/use-luminax-controller.ts`
- Modify: `src/modules/workbench/workbench-presentation.ts`
- Modify: `tests/chat/chat.test.ts`
- Modify: `tests/workbench/workbench-client.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Interfaces:**
- Consumes: `InsightSnapshotDto`, `InsightStreamEvent`, existing chat SSE parser, and controller state.
- Produces: `fetchLatestInsight()`, `updateLatestInsightAction(input)`, `useLatestInsight()`, `buildInsightEvidenceChartOption(evidence)`, `isInsightScopeActive(current, insight)`, and `applyInsightScope(scope)`.

- [ ] **Step 1: Write failing client protocol and request tests**

```ts
test("chat client parses insight lifecycle events", () => {
  const payloads = parseServerSentEvent(
    'data: {"type":"insight","status":"updated","insightId":"i1","findingCount":3,"actionCount":2}'
  );
  assert.deepEqual(payloads[0], {
    type: "insight",
    status: "updated",
    insightId: "i1",
    findingCount: 3,
    actionCount: 2,
  });
});

test("latest insight client redirects on 401 and preserves 403", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "洞察权限已失效" }, { status: 403 })
  );
  await assert.rejects(fetchLatestInsight(), (error) =>
    error instanceof InsightClientError &&
    error.status === 403 &&
    error.message === "洞察权限已失效"
  );
});

test("action client sends optimistic concurrency id", async (context) => {
  let body: unknown;
  context.mock.method(globalThis, "fetch", async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ insight: updatedInsightDto });
  });
  await updateLatestInsightAction({
    insightId: "i1",
    actionId: "a1",
    completed: true,
  });
  assert.deepEqual(body, { insightId: "i1", completed: true });
});
```

Add tests for malformed insight DTO rejection, `200 { insight: null }`, range comparison independent of store order, and chart options containing direct labels plus a baseline marker.

- [ ] **Step 2: Run focused client tests and confirm failure**

Run: `pnpm exec tsx --test tests/insights/insight-client.test.ts tests/chat/chat.test.ts`

Expected: FAIL on missing `insight-client.ts` and unsupported `insight` payload type.

- [ ] **Step 3: Extend the chat client additively**

Extend `ChatStreamPayload.type` with `"insight"`, add optional `status`, `insightId`, `findingCount`, and `actionCount`, and add:

```ts
export interface ChatStreamHandlers {
  onIntent: (metadata: IntentViewMetadata) => void;
  onContent: (content: string) => void;
  onInsight?: (event: InsightStreamEvent) => void;
  onStatus?: (status: string) => void;
  onReasoning?: (delta: string) => void;
}
```

Validate the three insight statuses before dispatch. Ignore malformed optional events rather than terminating the chat stream. Add `insight_generating: "正在更新洞察"` only if a regular status event uses it; the primary lifecycle remains the dedicated insight event.

Update `useChatStream` to accept `onInsightEvent?: (event) => void` and pass it to `streamChatMessage`. Do not append another assistant message for the event; server `content` remains the only chat text source.

- [ ] **Step 4: Implement the insight HTTP client and hook**

```ts
export interface UseLatestInsightResult {
  insight: InsightSnapshotDto | null;
  isLoading: boolean;
  error: string | null;
  generationStatus: "idle" | "generating" | "failed";
  reload(): Promise<InsightSnapshotDto | null>;
  handleStreamEvent(event: InsightStreamEvent): Promise<InsightSnapshotDto | null>;
  toggleAction(actionId: string, completed: boolean): Promise<void>;
}
```

The hook loads once on mount. `generating` preserves the current snapshot and sets status; `failed` preserves it and exposes a non-blocking message; `updated` calls `reload` and clears status only after the matching snapshot is returned. `toggleAction` immediately changes the matching action locally, then replaces state with the server response; on rejection it restores the previous snapshot and sets an error. A `409` triggers one reload so a stale browser cannot overwrite the new insight.

The DTO normalizer must validate dates, enum values, arrays, finite numeric series and cross references before returning data. It must ignore unknown additional response fields while never constructing server-only fields.

- [ ] **Step 5: Add scope comparison and explicit restoration**

Export from `use-luminax-controller.ts`:

```ts
interface ActiveInsightScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

const applyInsightScope = useCallback((scope: InsightScope) => {
  const allowed = scope.storeIds.filter((id) => authorizedStoreIds.has(id));
  if (allowed.length !== scope.storeIds.length || allowed.length === 0) return false;
  invalidateReportRequest();
  if (allowed.length === authorizedStores.length) {
    setCompareStores([]);
    setSelectedStore("all");
  } else if (allowed.length > 1) {
    setCompareStores(allowed);
    setSelectedStore("all");
  } else {
    setCompareStores([]);
    setSelectedStore(allowed[0]);
  }
  setStartDate(scope.startDate);
  setEndDate(scope.endDate);
  setInsightView("analysis");
  return true;
}, [authorizedStores, invalidateReportRequest]);
```

Return `activeInsightScope` from the controller. Add pure `isInsightScopeActive` to `workbench-presentation.ts`; compare sorted unique store IDs plus exact dates. Global filter edits do not mutate the stored insight.

- [ ] **Step 6: Build deterministic evidence chart options**

`buildInsightEvidenceChartOption(evidence)` uses ECharts and never calls a model:

- `store_target_variance`, `channel_contribution`, `category_contribution`, `daypart_contribution`, and `metric_drivers`: horizontal bars, descending absolute contribution, direct end labels, direction colors, and an optional dashed baseline.
- `period_variance` and `anomaly_dates`: category-axis bars/lines ordered by series key, direct labels, and an optional baseline line.
- Positive `#16794f`, negative `#c53b32`, neutral `#6b7280`, baseline `#17181a`, grid line `#dedfe2`, no gradient.
- `grid` reserves at least `96px` left and `56px` right so labels do not clip; chart height is derived by the component later with a minimum of `220px`.

- [ ] **Step 7: Register and run client tests**

Add `import "./insights/insight-client.test";`. Run:

```bash
pnpm exec tsx --test tests/insights/insight-client.test.ts tests/chat/chat.test.ts tests/workbench/workbench-client.test.ts
pnpm run ts-check
```

Expected: all tests PASS.

- [ ] **Step 8: Commit client state and protocol support**

```bash
git add src/modules/insights/insight-client.ts src/modules/insights/insight-chart-options.ts src/hooks/use-latest-insight.ts src/modules/chat/chat-stream-client.ts src/hooks/use-chat-stream.ts src/hooks/use-luminax-controller.ts src/modules/workbench/workbench-presentation.ts tests/insights/insight-client.test.ts tests/chat/chat.test.ts tests/workbench/workbench-client.test.ts tests/module-interfaces.test.ts
git commit -m "feat: add insight workspace client state"
```

---

### Task 7: Replace The Duplicate Analysis UI With Insights And Actions

**Files:**
- Create: `src/components/luminax/workbench/InsightActionPanel.tsx`
- Create: `src/components/luminax/workbench/InsightFindingList.tsx`
- Create: `src/components/luminax/workbench/InsightEvidenceSection.tsx`
- Create: `src/components/luminax/workbench/InsightActionChecklist.tsx`
- Modify: `src/components/luminax/LuminaXApp.tsx`
- Modify: `src/components/luminax/workbench/InsightCanvas.tsx`
- Delete: `src/components/luminax/workbench/AnalysisPanel.tsx`
- Modify: `tests/workbench/workbench-client.test.ts`

**Interfaces:**
- Consumes: Task 6 hook, scope helpers and chart options; existing `AssistantPanel`, `WorkbenchShell`, `Checkbox`, `Badge`, and Lucide icons.
- Produces: the approved “分析来源 → 核心判断 → 关键发现 → 支持证据 → 待核查项 → 建议行动” experience.

- [ ] **Step 1: Write failing presentation and component-state tests**

Use server-renderable states that do not mount ECharts:

```ts
test("insight canvas exposes the renamed tab", () => {
  const html = renderToStaticMarkup(createElement(InsightCanvas, emptyProps));
  assert.match(html, />洞察与行动</);
  assert.doesNotMatch(html, />经营分析</);
});

test("insight panel keeps an old snapshot visible while generating", () => {
  const html = renderToStaticMarkup(createElement(InsightActionPanel, {
    insight: insightDto,
    generationStatus: "generating",
    activeScope,
    suggestions: [],
    onAskQuestion() {},
    onApplyScope() {},
    onToggleAction: async () => undefined,
  }));
  assert.match(html, /正在更新洞察/);
  assert.match(html, new RegExp(insightDto.headline));
});

test("scope mismatch offers an explicit restore command", () => {
  const html = renderInsightPanel({ activeScope: differentScope });
  assert.match(html, /当前筛选范围与该洞察生成范围不同/);
  assert.match(html, /切换至洞察范围/);
});
```

Also cover empty state suggestions, failed-update banner, verification items, P0/P1/P2 action labels, and checked action rendering.

- [ ] **Step 2: Run the workbench test and confirm failure**

Run: `pnpm exec tsx --test tests/workbench/workbench-client.test.ts`

Expected: FAIL because `InsightActionPanel` is missing and the tab is still named `经营分析`.

- [ ] **Step 3: Build the focused panel components**

`InsightActionPanel` owns only view state: selected finding ID, highlighted evidence IDs, DOM refs, and scroll behavior. Render these un-nested full-width sections:

1. Source strip: original question, store scope, date range, comparison label and update time.
2. Core judgment: one compact high-emphasis band with headline; no hero-scale typography.
3. `InsightFindingList`: 3-5 rows with severity/confidence badges, controlled `displayValue`, summary and a button labeled “查看证据”.
4. `InsightEvidenceSection`: evidence blocks with title, baseline, deterministic chart and server-built interpretation.
5. Verification section: observed fact, hypothesis and required check; omit the section when empty.
6. `InsightActionChecklist`: checkbox, priority, title, owner role and verification metric; completed items use muted text but remain readable.

Finding clicks call `element.scrollIntoView({ behavior: "smooth", block: "nearest" })`, set all referenced evidence IDs active, and clear highlight after `1800ms`. Use `aria-current` on the selected finding and `data-highlighted` on evidence blocks.

Use `dynamic(() => import("echarts-for-react"), { ssr: false })` only inside `InsightEvidenceSection`. Chart height is `Math.max(220, evidence.series.length * 38 + 72)` and width is `100%`. Direct labels must remain enabled on mobile.

- [ ] **Step 4: Implement loading, empty, failure, and scope states**

- Initial load: a fixed-height skeleton with `role="status"` and “正在加载最新洞察”.
- Empty: “尚无洞察” plus up to three permission-filtered suggested question buttons that invoke `onAskQuestion(question)`.
- Generating with old data: retain all old content and show a slim top status strip.
- Generating without data: show the skeleton and “正在生成第一份洞察”.
- Failed generation: retain old data and show “本次洞察更新失败，聊天回答不受影响”; no internal error.
- Scope mismatch: show a compact warning strip with one `ArrowRightLeft` icon button/text command “切换至洞察范围”. Do not auto-apply scope on refresh.
- Unauthorized GET: show the client error and no snapshot body; do not display a partially filtered insight.

- [ ] **Step 5: Connect LuminaXApp and remove duplicate data wiring**

In `LuminaXApp`:

```ts
const latestInsight = useLatestInsight();
const chat = useChatStream({
  onIntentMetadata: controller.applyIntentMetadata,
  onInsightEvent: async (event) => {
    const snapshot = await latestInsight.handleStreamEvent(event);
    if (event.status === "updated" && snapshot) {
      controller.applyInsightScope(snapshot.scope);
      controller.setInsightView("analysis");
    }
  },
});
```

Pass snapshot state, suggestions, `chat.sendMessage`, controller scope and toggle/apply handlers to `InsightCanvas`. Remove `analysisContent`, `dataSummary`, `chartOptions`, and `isAnalyzing` from the analysis-view props; Overview still receives its existing data. Delete `AnalysisPanel.tsx` after all imports are removed.

In `InsightCanvas`, rename only the tab label to “洞察与行动”; keep the internal `InsightView` value `"analysis"` to avoid breaking role-template and intent routing contracts. Render `InsightActionPanel` for that value.

- [ ] **Step 6: Run focused UI tests and static checks**

Run:

```bash
pnpm exec tsx --test tests/workbench/workbench-client.test.ts tests/insights/insight-client.test.ts
pnpm run ts-check
pnpm run lint:build
```

Expected: all commands PASS; no import remains for `AnalysisPanel`.

- [ ] **Step 7: Commit the new workspace UI**

```bash
git add src/components/luminax/LuminaXApp.tsx src/components/luminax/workbench/InsightCanvas.tsx src/components/luminax/workbench/InsightActionPanel.tsx src/components/luminax/workbench/InsightFindingList.tsx src/components/luminax/workbench/InsightEvidenceSection.tsx src/components/luminax/workbench/InsightActionChecklist.tsx src/components/luminax/workbench/AnalysisPanel.tsx tests/workbench/workbench-client.test.ts
git commit -m "feat: replace analysis view with insight actions"
```

---

### Task 8: Synchronize Architecture Docs And Verify The Complete POC Journey

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/architecture.md`
- Modify: `tests/docs/documentation.test.ts`
- Modify: `tests/contracts/public-contracts.test.ts`

**Interfaces:**
- Consumes: all completed server and client behavior.
- Produces: durable architecture guidance, release-level automated verification, and browser evidence for desktop/mobile behavior.

- [ ] **Step 1: Write failing documentation assertions**

Add assertions that `AGENTS.md` and `docs/architecture.md` name:

```ts
for (const requiredText of [
  "InsightComposer",
  "LatestInsightRepository",
  "GET /api/insights/latest",
  "PATCH /api/insights/latest/actions/:actionId",
  "DEEPSEEK_INSIGHT_MODEL",
  "latest-insights.json",
]) {
  assert.match(agents, new RegExp(escapeRegExp(requiredText)));
  assert.match(architecture, new RegExp(escapeRegExp(requiredText)));
}
```

Update the existing chat adapter assertion so documentation accurately says it queues live SSE callbacks rather than delegating to the legacy `streamChatResponse` helper.

- [ ] **Step 2: Run documentation tests and confirm failure**

Run: `pnpm exec tsx --test tests/docs/documentation.test.ts`

Expected: FAIL on the first missing insight architecture term.

- [ ] **Step 3: Update AGENTS.md and architecture documentation**

Document:

- Insight is a projection module, not a fourth runtime Agent.
- `InsightComposer` uses `DEEPSEEK_INSIGHT_MODEL || DEEPSEEK_MODEL || deepseek-v4-flash`, no memory, no database and no metric calculation.
- Business Agent exposes authorized structured analysis through `onAnalysisReady` before full answer generation.
- `LatestInsightRepository` defaults to `.luminax/latest-insights.json` and is replaceable by a MySQL implementation.
- GET/PATCH routes reauthorize exact table, column and store requirements.
- SSE adds `insight` lifecycle events without changing existing event payloads.
- The “analysis” internal view ID now presents “洞察与行动”; Overview and Report remain independent.
- Generation failures preserve old insight and full chat fallback; stale requests cannot overwrite newer results.

Do not include any model prompt body, API key, database password, Cookie, local absolute secret path or sample sensitive question.

- [ ] **Step 4: Run the complete automated verification**

Run in this order:

```bash
pnpm run ts-check
pnpm run lint:build
pnpm run test
pnpm run build
```

Expected: all four commands exit `0`. If the local MySQL service is available, additionally run `pnpm run test:sql-metrics`; this optional integration check must not replace the four required commands.

- [ ] **Step 5: Inspect the staged diff for secrets and unintended changes**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff -- . ':!pnpm-lock.yaml'
git grep -n -I -E 'sk-[A-Za-z0-9_-]{16,}|LuminaX_readonly|MYSQL_PASSWORD=' -- . ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/2026-08-13-insight-action-workspace.md'
```

Expected: `git diff --check` has no output; secret scan has no output; only insight feature, tests and architecture docs are changed.

- [ ] **Step 6: Start a verification server without disturbing port 5000 production unless required**

If port `5000` is already serving the newly built branch, reuse it. Otherwise stop only the LuminaX process bound to `5000` and run:

```bash
pnpm start
```

Expected: `http://localhost:5000/login?next=/` responds and login with the configured local admin credential succeeds. Never print the password or session cookie in logs or the final report.

- [ ] **Step 7: Verify the authenticated browser journey at desktop and mobile widths**

Use the in-app browser or Playwright and verify:

1. Desktop `1440x900`: login, open Overview, submit a compare or attribution question, observe generating state, short chat receipt, automatic switch to “洞察与行动”, 3-5 findings, evidence charts, verification section when present and 2-5 actions.
2. Click a finding: its evidence scrolls into view and highlights without layout shift.
3. Toggle one action, refresh and log in again: the same latest snapshot and action state restore.
4. Change the global store/date range: snapshot remains unchanged and the mismatch banner appears; “切换至洞察范围” restores the saved scope.
5. Submit a single achievement-rate query: chat answers normally and the latest insight ID remains unchanged.
6. Force a Composer failure with an injected test model or local test seam: chat returns the complete existing answer and the previous insight remains.
7. Mobile `390x844`: tabs wrap safely, source text and buttons fit, chart labels remain readable, actions do not overlap, and no horizontal page scrollbar appears.

Capture screenshots outside tracked source directories, inspect them visually, and remove transient artifacts after verification.

- [ ] **Step 8: Commit documentation and final verification fixes**

```bash
git add AGENTS.md docs/architecture.md tests/docs/documentation.test.ts tests/contracts/public-contracts.test.ts
git commit -m "docs: document insight action architecture"
git status --short --branch
```

Expected: the branch is clean after the commit. Report the exact verification commands run, any optional MySQL check skipped, the local URL, and the final commit IDs.

---

## Final Acceptance Trace

| Approved requirement | Implemented by |
| --- | --- |
| Meaningful intents update insights; simple/report/custom/rejected requests do not | Tasks 1, 4 |
| SQL remains numeric authority; model cannot invent values | Task 3 |
| Attribution Agent remains in the attribution path | Task 4 |
| Chat success receipt and full-answer fallback without duplicate body | Task 4 |
| Per-user latest snapshot and refresh/login restore | Tasks 2, 5, 6 |
| Table, column and store reauthorization | Task 5 |
| Stale generation and action optimistic concurrency | Tasks 2, 4, 5 |
| Findings, deterministic evidence, verification and actions | Tasks 3, 7 |
| Scope mismatch warning and explicit restore | Tasks 6, 7 |
| Desktop/mobile operational UI | Tasks 7, 8 |
| Existing Overview, Report, Agents, SSE and SQL contracts remain compatible | Tasks 4, 7, 8 |
