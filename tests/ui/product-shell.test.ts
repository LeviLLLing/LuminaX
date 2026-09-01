import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "../../src/components/auth/LoginForm";
import { ProductBrandBar } from "../../src/components/luminax/ProductBrandBar";
import { ProductState } from "../../src/components/luminax/ProductState";

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
  assert.doesNotMatch(html, /了解更多|联系我们|产品能力/);
});
