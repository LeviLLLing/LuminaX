import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const baseRevision = "9cfc41bf78936e05ba615347ab626b79ac80c46b";
const basePath = "tests/module-interfaces.test.ts";
const ownershipFiles = [
  "tests/admin/metrics.test.ts",
  "tests/admin/permissions.test.ts",
  "tests/auth/auth.test.ts",
  "tests/analysis/analysis.test.ts",
  "tests/agents/agents.test.ts",
  "tests/chat/chat.test.ts",
  "tests/reports/reports.test.ts",
];

function normalizeCallbackSource(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[ \t]*/, ""))
    .join("\n");
}

function callbackBodies(sourceText: string, fileName: string): Map<string, string> {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const bodies = new Map<string, string>();

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "test" &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[1] &&
      (ts.isArrowFunction(node.arguments[1]) ||
        ts.isFunctionExpression(node.arguments[1]))
    ) {
      bodies.set(
        node.arguments[0].text,
        normalizeCallbackSource(node.arguments[1].getText(sourceFile))
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bodies;
}

const baseSource = execFileSync("git", ["show", `${baseRevision}:${basePath}`], {
  encoding: "utf8",
});
const expected = callbackBodies(baseSource, basePath);
const actual = new Map<string, string>();

for (const ownershipFile of ownershipFiles) {
  const source = readFileSync(resolve(ownershipFile), "utf8");
  for (const [name, body] of callbackBodies(source, ownershipFile)) {
    if (actual.has(name)) {
      throw new Error(`Duplicate moved test name: ${name}`);
    }
    actual.set(name, body);
  }
}

const missing = [...expected.keys()].filter((name) => !actual.has(name));
const unexpected = [...actual.keys()].filter((name) => !expected.has(name));
const changed = [...expected.keys()].filter(
  (name) => expected.get(name) !== actual.get(name)
);

if (missing.length || unexpected.length || changed.length) {
  throw new Error(
    [
      `Missing: ${missing.join(", ") || "none"}`,
      `Unexpected: ${unexpected.join(", ") || "none"}`,
      `Changed bodies: ${changed.join(", ") || "none"}`,
    ].join("\n")
  );
}

console.log(
  `PASS: ${actual.size} callback bodies match ${baseRevision} after CRLF/LF and indentation normalization.`
);
