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
