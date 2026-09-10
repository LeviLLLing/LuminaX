import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../../src/components/auth/LoginForm";
import {
  WorkbenchErrorState,
  WorkbenchLoadingState,
} from "../../src/components/luminax/LuminaXApp";
import { ProductBrandBar } from "../../src/components/luminax/ProductBrandBar";
import { ProductState } from "../../src/components/luminax/ProductState";
import { WorkbenchHeader } from "../../src/components/luminax/workbench/WorkbenchHeader";
import { WorkbenchShell } from "../../src/components/luminax/workbench/WorkbenchShell";
import { DecisionBrief } from "../../src/components/luminax/workbench/DecisionBrief";
import { ReportView } from "../../src/components/luminax/workbench/ReportView";
import { AdminShell } from "../../src/components/admin/AdminShell";
import { ReservedAdminModule } from "../../src/components/admin/ReservedAdminModule";

test("mobile product surfaces and portaled admin editors reserve 44px targets", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  const shell = renderToStaticMarkup(createElement(WorkbenchShell, {
    header: null, scopeBar: null, dataPanel: null, assistantPanel: null,
  }));
  assert.match(shell, /data-workbench-shell="true"/);
  assert.match(css, /@media \(width < 48rem\)/);
  assert.match(css, /:where\(\[data-workbench-shell\], \[data-admin-layout\]\)/);
  assert.match(css, /\[data-admin-editor\]/);
  assert.match(css, /\[data-slot="select-content"\]/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /min-width: 44px/);
});

test("admin editor touch-target override excludes textareas with explicit height", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  const editorSelector = css.match(
    /\[data-admin-editor\] :is\(([\s\S]*?)\),\s*\[data-slot="dropdown-menu-content"\]/
  );

  assert.ok(editorSelector, "admin editor mobile selector is missing");
  assert.match(editorSelector[1], /button:not\(\[role="checkbox"\], \[role="switch"\]\)/);
  assert.match(editorSelector[1], /input:not\(\[type="checkbox"\]\)/);
  assert.match(editorSelector[1], /select/);
  assert.match(editorSelector[1], /\[role="combobox"\]/);
  assert.doesNotMatch(editorSelector[1], /textarea/);
});

test("metric and permission editors identify mobile control and binary-label boundaries", async () => {
  const [metrics, permissions] = await Promise.all([
    readFile("src/components/admin/MetricRegistryPanel.tsx", "utf8"),
    readFile("src/components/admin/PermissionManagementPanel.tsx", "utf8"),
  ]);

  assert.match(metrics, /data-admin-editor="metric"/);
  assert.match(permissions, /data-admin-editor="permission"/);
  assert.match(metrics, /<Label className="[^"]*min-h-11[^"]*md:min-h-0[^"]*"[^>]*htmlFor="metric-insight-policy"/);
  assert.match(permissions, /<Label className="[^"]*min-h-11[^"]*md:min-h-0[^"]*"[^>]*htmlFor="permission-active"/);
  assert.match(permissions, /min-h-11[^\"]*md:min-h-9/);
});

test("product brand and state primitives expose stable semantics", () => {
  const brand = renderToStaticMarkup(
    createElement(ProductBrandBar, { contextLabel: "经营决策工作台" })
  );
  assert.match(brand, /data-luminax-brand="true"/);
  assert.match(brand, /经营决策工作台/);

  const brandOnly = renderToStaticMarkup(createElement(ProductBrandBar, {}));
  assert.match(brandOnly, />LuminaX</);
  assert.doesNotMatch(brandOnly, /aria-hidden="true"/);

  const state = renderToStaticMarkup(
    createElement(ProductState, {
      kind: "denied",
      title: "无权访问",
      description: "请联系管理员",
    })
  );
  assert.match(state, /role="alert"/);
  assert.match(state, /无权访问/);
});

test("admin secondary body copy uses the readable semantic text token", async () => {
  for (const file of ["MetricRegistryPanel", "PermissionManagementPanel", "ReservedAdminModule"]) {
    const source = await readFile(`src/components/admin/${file}.tsx`, "utf8");
    assert.doesNotMatch(source, /<(?:div|p|span)[^>]*className="[^"]*text-zinc-400/);
  }
});

test("insight captions and completed actions retain readable body contrast", async () => {
  for (const file of ["InsightActionPanel", "InsightActionChecklist"]) {
    const source = await readFile(`src/components/luminax/workbench/${file}.tsx`, "utf8");
    assert.doesNotMatch(source, /text-\[#777b84\]/);
  }
});

test("product states distinguish passive and urgent feedback", () => {
  const loading = renderToStaticMarkup(
    createElement(ProductState, {
      kind: "loading",
      title: "正在加载",
      description: "请稍候",
    })
  );
  const empty = renderToStaticMarkup(
    createElement(ProductState, {
      kind: "empty",
      title: "暂无数据",
      description: "调整筛选范围后重试",
      action: createElement("button", { type: "button" }, "调整范围"),
    })
  );

  assert.match(loading, /role="status"/);
  assert.match(empty, /role="status"/);
  assert.match(empty, /<button type="button">调整范围<\/button>/);
});

test("login remains a single accessible task", () => {
  const html = renderToStaticMarkup(createElement(LoginForm, { nextPath: "/" }));
  assert.match(html, /登录工作台/);
  assert.match(html, /aria-label="显示密码"/);
  assert.match(html, /autocomplete="username"/i);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /class="[^"]*pl-9 pr-12[^"]*"/);
  assert.doesNotMatch(html, /了解更多|联系我们|产品能力/);
});

test("workbench shell keeps stable data and decision regions", () => {
  const html = renderToStaticMarkup(
    createElement(WorkbenchShell, {
      header: createElement("div", null, "header"),
      scopeBar: createElement("div", null, "scope"),
      dataPanel: createElement("div", null, "data"),
      assistantPanel: createElement("div", null, "assistant"),
    })
  );

  assert.match(html, /data-workbench-region="scope"/);
  assert.match(html, /data-workbench-region="data"/);
  assert.match(html, /data-workbench-region="assistant"/);
  assert.match(html, /经营数据/);
  assert.match(html, /决策协同/);
});

test("workbench header reuses product branding and preserves commands", () => {
  const html = renderToStaticMarkup(
    createElement(WorkbenchHeader, {
      user: {
        id: "user-1",
        username: "admin",
        displayName: "系统管理员",
        role: "super_admin",
      },
      context: {
        templateId: "regional_manager",
        availableStoreIds: ["S001"],
        availableMetricCodes: [],
        availableIntents: [],
        canAccessAdmin: true,
      },
    })
  );

  assert.match(html, /data-luminax-brand="true"/);
  assert.match(html, /区域经理模板/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /退出登录/);
});

test("workbench lifecycle feedback uses shared product states", () => {
  const loading = renderToStaticMarkup(createElement(WorkbenchLoadingState));
  const error = renderToStaticMarkup(
    createElement(WorkbenchErrorState, {
      message: "工作台暂时不可用",
      onRetry: () => undefined,
    })
  );

  assert.match(loading, /data-product-state="loading"/);
  assert.match(error, /data-product-state="error"/);
  assert.match(error, /重新加载/);
});

test("decision brief reports generation without fabricating insight content", () => {
  const html = renderToStaticMarkup(
    createElement(DecisionBrief, {
      insight: null,
      generationStatus: "generating",
      pendingActionIds: [],
      assistantMode: "summary_first",
      onOpenInsight: () => undefined,
    })
  );

  assert.match(html, /正在生成决策简报/);
  assert.doesNotMatch(html, /查看完整洞察/);
  assert.doesNotMatch(html, /项已完成/);
});

test("formal report surface is distinct from the dashboard", () => {
  const reportHTML = "<!DOCTYPE html><h1>区域经营周报</h1>";
  const html = renderToStaticMarkup(
    createElement(ReportView, {
      reportHTML,
    })
  );

  assert.match(html, /<article[^>]*aria-label="经营周报"/);
  assert.match(html, /正式报告/);
  assert.equal((html.match(/<article/g) ?? []).length, 1);
  assert.match(html, /srcDoc="&lt;!DOCTYPE html&gt;&lt;h1&gt;区域经营周报&lt;\/h1&gt;"/);
  assert.match(html, /sandbox="allow-scripts allow-same-origin"/);
  assert.doesNotMatch(html, /总销售额.*目标达成率.*订单量/);
});

test("admin shell exposes modular navigation and work-focused content", () => {
  const html = renderToStaticMarkup(
    createElement(AdminShell, {
      user: {
        id: "admin",
        username: "admin",
        displayName: "系统管理员",
        role: "super_admin",
      },
    })
  );

  assert.match(html, /aria-label="管理模块"/);
  assert.match(html, /指标注册/);
  assert.match(html, /权限管理/);
  assert.match(html, /报表管理/);
  assert.match(html, /报表设置/);
  assert.match(html, /data-admin-layout="capability-navigation"/);
  const navigationBlocks = html.match(/<nav[^>]*aria-label="管理模块"[^>]*>[\s\S]*?<\/nav>/g) ?? [];
  assert.equal(navigationBlocks.length, 2);
  for (const navigation of navigationBlocks) {
    assert.equal((navigation.match(/<button/g) ?? []).length, 4);
    assert.equal((navigation.match(/aria-current="page"/g) ?? []).length, 1);
  }
  for (const label of ["指标注册", "权限管理", "报表管理", "报表设置"]) {
    assert.ok(navigationBlocks.every((navigation) => navigation.includes(label)));
  }
  assert.match(html, /指标注册表/);
});

test("reserved admin modules use a table empty state", () => {
  const html = renderToStaticMarkup(
    createElement(ReservedAdminModule, { module: "reports" })
  );

  assert.match(html, /报表名称/);
  assert.match(html, /暂无配置/);
  assert.match(html, /<table/);
  assert.match(html, /<thead/);
  assert.match(html, /<th[^>]*scope="col"/);
  assert.match(html, /container-type:inline-size/);
  assert.match(html, /sticky left-0[^\"]*w-\[100cqw\]/);
  assert.doesNotMatch(html, /功能即将上线|敬请期待/);
});
