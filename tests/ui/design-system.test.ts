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
