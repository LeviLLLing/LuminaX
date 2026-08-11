import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project instructions describe the current architecture", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  assertIncludesAll(agents, [
    "`src/app/api/chat/route.ts` delegates `POST` to `handleChatHttpRequest`",
    "Runtime chat composition in `src/modules/chat/chat-composition.ts` creates Governance, Business, and Attribution Agents with separate `DeepSeekChatModel` and `InMemoryAgentMemory` instances.",
    "Fixed and published custom metric values are calculated by SQL, not by an Agent.",
    "Every data request is authorized on the server by table, column, and store value.",
    "Missing or invalid governance model output rejects the request.",
    "`luminax_session` is an HTTP-only, strict same-site session cookie.",
  ]);
  assert.doesNotMatch(agents, /所有数值计算由 JavaScript/);
  assert.doesNotMatch(agents, /聊天接口不依赖外部 LLM/);
});

test("runbook and design guide contain approved contracts", async () => {
  const [readme, design] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("DESIGN.md", "utf8"),
  ]);
  assertIncludesAll(readme, [
    "当前 Phase 0 UI 由既有的 `LuminaXApp` 提供，默认显示聊天视图，并按分析意图切换到仪表盘或报告视图。",
    "已批准的统一双核工作台、两种固定角色模板和移动端分段视图是后续阶段的目标设计，当前运行时尚未实现。",
    "Governance 必须获得可用的 DeepSeek 模型结果；模型未配置、不可用或返回无效结果时，治理失败关闭，受治理的聊天不会进入 Business Agent。",
    "只有已通过 Governance 的下游 Business 和 Attribution 解释路径在各自模型不可用时使用本地确定性回退。",
    "管理员 API 当前同时要求有效登录会话、`super_admin` 角色，并要求请求主机为 `localhost`、`127.0.0.1` 或 `::1`。",
    "`LUMINAX_DATA_SOURCE=mysql` 是当前活跃的本地数据设置，`json` 仅用于演示回退。",
    "`pnpm run validate` 执行 TypeScript、ESLint 和完整的 27 项模块接口测试。",
  ]);
  assert.doesNotMatch(readme, /LUMINAX_ADMIN_TOKEN/);
  assert.doesNotMatch(readme, /DeepSeek 配置是可选的解释层/);

  assertIncludesAll(design, [
    "本文件是后续阶段统一工作台的目标设计合同，不描述 Phase 0 当前已实现的 `LuminaXApp` 界面。",
    "`templateId` 仅有两个固定值：`regional_manager` 和 `default`。",
    "区域经理模板 `regional_manager` 默认突出辖区概况、异常门店、门店下钻、经营归因和周报入口。",
    "通用默认模板 `default` 提供标准经营概览、指标分析、AI 对话和报表入口。",
    "`manager` 固定解析为 `regional_manager`。",
    "`super_admin` 固定解析为 `default`，并显示管理后台入口。",
    "其他现有角色固定解析为 `default`；未知角色或解析失败也安全回退到 `default`。",
    "模板映射由系统确定，管理员不能选择、创建或重新分配模板。",
    "LuminaX 黄 `#FFE600` 是不可替换的品牌色",
    "从 `360px` 宽度起，移动端使用分段式工作台",
  ]);
  assert.doesNotMatch(design, /角色模板至少覆盖系统管理员、经理和分析员/);
  assert.doesNotMatch(design, /先选择角色模板/);
});

function assertIncludesAll(document: string, fragments: string[]): void {
  for (const fragment of fragments) {
    assert.ok(document.includes(fragment), `missing factual fragment: ${fragment}`);
  }
}
