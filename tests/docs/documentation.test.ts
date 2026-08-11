import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project instructions describe the current architecture", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  for (const required of [
    "DeepSeek",
    "MySQL",
    "SQL Server",
    "Governance Agent",
    "Business Agent",
    "Attribution Agent",
    "Superpowers",
  ]) {
    assert.match(agents, new RegExp(required));
  }
});

test("runbook and design guide contain approved contracts", async () => {
  const [readme, design] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("DESIGN.md", "utf8"),
  ]);
  assert.match(readme, /LUMINAX_DATA_SOURCE/);
  assert.match(readme, /MYSQL_USERNAME/);
  assert.match(readme, /pnpm run validate/);
  assert.match(design, /明亮运营中心/);
  assert.match(design, /360px/);
});
