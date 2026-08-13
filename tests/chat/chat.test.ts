import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessAgent } from "../../src/modules/agents/business/business-agent";
import type { GovernanceAgent } from "../../src/modules/agents/governance/governance-agent";
import {
  ChatApplicationError,
  createChatApplication,
} from "../../src/modules/chat/chat-application";
import {
  parseServerSentEvent,
  streamChatMessage,
} from "../../src/modules/chat/chat-stream-client";
import type { InsightApplication } from "../../src/modules/insights/insight-application";
import type { InsightSnapshot } from "../../src/modules/insights/insight-types";

test("chat application routes governance rejection and approved handoff", async () => {
  let businessCalls = 0;
  const governanceAgent: GovernanceAgent = {
    async review({ sessionId, question }) {
      if (question.includes("天气")) {
        return {
          decision: "reject",
          category: "out_of_scope",
          reason: "weather",
          userMessage: "拒绝天气问题",
        };
      }
      return {
        decision: "allow",
        category: "allowed",
        reason: "approved",
        handoff: { sessionId, question },
      };
    },
  };
  const businessAgent: BusinessAgent = {
    async execute(request) {
      businessCalls += 1;
      return {
        intentResult: {
          intent: "achievement_rate",
          storeIds: ["S001"],
          startDate: null,
          endDate: null,
          relevant: true,
          outOfScope: false,
        },
        content: request.question,
        storeIds: ["S001"],
        startDate: "2025-05-05",
        endDate: "2025-05-07",
      };
    },
  };
  const application = createChatApplication({
    governanceAgent,
    businessAgent,
  });

  const rejected = await application.execute({
    sessionId: "chat-session",
    question: "天气怎么样",
  });
  const approved = await application.execute({
    sessionId: "chat-session",
    question: "分析 S001 销售",
  });

  assert.equal(rejected.content, "拒绝天气问题");
  assert.equal(approved.content, "分析 S001 销售");
  assert.equal(businessCalls, 1);
  await assert.rejects(
    () => application.execute({ question: " " }),
    (error) =>
      error instanceof ChatApplicationError &&
      error.code === "MISSING_QUESTION"
  );
});

test("SSE parser keeps protocol handling outside the React hook", () => {
  const payloads = parseServerSentEvent(
    'data: {"type":"intent","intent":"compare","storeIds":["S001","S002"]}\n' +
      'data: {"type":"content","content":"done"}\n' +
      "data: [DONE]"
  );

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].intent, "compare");
  assert.equal(payloads[1].content, "done");
});

test("chat stream preserves a server permission error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: "当前账号没有权限访问该指标所需的数据。" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );

  try {
    await assert.rejects(
      () =>
        streamChatMessage(
          { question: "计算 S001 的销售达成率", sessionId: "permission-test" },
          { onIntent() {}, onContent() {} }
        ),
      (error) =>
        error instanceof Error &&
        error.message === "当前账号没有权限访问该指标所需的数据。"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful insight generation emits updated after save and returns a receipt", async () => {
  const events: string[] = [];
  let saved = false;
  const application = createChatApplication({
    governanceAgent: allowGovernance(),
    businessAgent: projectingBusinessAgent(),
    insightApplication: insightApplication(async () => {
      saved = true;
      return snapshot();
    }),
  });
  const result = await application.execute({
    userId: "u1",
    question: "对比门店表现",
    stream: { emitStatus() {}, emitReasoning() {}, emitContent() {}, emitInsight(event) {
      if (event.status === "updated") assert.equal(saved, true);
      events.push(event.status);
    } },
  });
  assert.deepEqual(events, ["generating", "updated"]);
  assert.match(result.content, /洞察与行动已更新/);
  assert.doesNotMatch(result.content, /完整业务分析正文/);
});

test("insight failure emits failed and falls back to one full answer", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const events: string[] = [];
  const content: string[] = [];
  const application = createChatApplication({
    governanceAgent: allowGovernance(),
    businessAgent: projectingBusinessAgent(),
    insightApplication: insightApplication(async () => { throw new Error("composer failed"); }),
  });
  const result = await application.execute({
    userId: "u1", question: "对比门店表现",
    stream: { emitStatus() {}, emitReasoning() {}, emitContent(value) { content.push(value); }, emitInsight(event) { events.push(event.status); } },
  });
  assert.deepEqual(events, ["generating", "failed"]);
  assert.equal(result.content, "完整业务分析正文");
  assert.deepEqual(content, ["完整业务分析正文"]);
});

test("non-triggering intent emits no insight event and does not generate", async () => {
  let generations = 0;
  const events: string[] = [];
  const application = createChatApplication({
    governanceAgent: allowGovernance(),
    businessAgent: projectingBusinessAgent("achievement_rate"),
    insightApplication: insightApplication(async () => { generations += 1; return snapshot(); }),
  });
  await application.execute({
    userId: "u1", question: "查看达成率",
    stream: { emitStatus() {}, emitReasoning() {}, emitContent() {}, emitInsight(event) { events.push(event.status); } },
  });
  assert.equal(generations, 0);
  assert.deepEqual(events, []);
});

function allowGovernance(): GovernanceAgent {
  return { async review({ sessionId, question }) { return { decision: "allow", category: "allowed", reason: "ok", handoff: { sessionId, question } }; } };
}

function projectingBusinessAgent(intent: "compare" | "achievement_rate" = "compare"): BusinessAgent {
  return {
    async execute(request) {
      const analysis = {
        question: request.question, intent, analysisData: { stores: [] }, attributionNarrative: null,
        fallbackContent: "完整业务分析正文", storeIds: ["S001"], startDate: "2025-05-01", endDate: "2025-05-14",
        accessRequirements: [{ tableName: "store_master", columns: ["store_id"] }],
      };
      const override = await request.onAnalysisReady?.(analysis);
      if (!override) request.stream?.emitContent("完整业务分析正文");
      return { intentResult: { intent, storeIds: ["S001"], startDate: null, endDate: null, relevant: true, outOfScope: false }, content: override?.content || "完整业务分析正文", storeIds: ["S001"], startDate: analysis.startDate, endDate: analysis.endDate };
    },
  };
}

function insightApplication(generate: () => Promise<InsightSnapshot>): InsightApplication {
  return { beginRequest(userId) { return { userId, requestId: "r1", startedAt: 1 }; }, generateForAnalysis: generate, async getLatest() { return null; }, async updateAction() { throw new Error("unused"); } };
}

function snapshot(): InsightSnapshot {
  return { id: "i1", userId: "u1", sourceQuestion: "q", sourceIntent: "compare", scope: { storeIds: ["S001"], startDate: "2025-05-01", endDate: "2025-05-14", comparisonLabel: null }, headline: "h", findings: [{ id: "f1", title: "需关注门店差异", summary: "持续观察", severity: "medium", confidence: "high", subjectIds: ["S001"], metricCode: "sales", value: 1, unit: "count", displayValue: "1", evidenceIds: ["e1"] }], evidence: [], verificationItems: [], actions: [{ id: "a1", priority: "P0", title: "核查执行", ownerRole: "区域经理", verificationMetricCode: "sales", verificationMetricLabel: "销售额", completed: false, completedAt: null }], accessRequirements: [], sourceFingerprint: "fp", createdAt: "2025-05-14T00:00:00.000Z", updatedAt: "2025-05-14T00:00:00.000Z" };
}
