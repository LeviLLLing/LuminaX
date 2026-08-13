import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileLatestInsightRepository,
  InsightConflictError,
  InsightNotFoundError,
  InsightRepositoryCorruptError,
} from "../../src/modules/insights/latest-insight-repository";
import { InsightGenerationGuard } from "../../src/modules/insights/insight-generation-guard";
import type { InsightAction, InsightSnapshot } from "../../src/modules/insights/insight-types";

const temporaryDirectories: string[] = [];

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })
    )
  );
});

test("repository replaces and restores one latest snapshot per user", async () => {
  const file = join(await createTemporaryDirectory(), "latest.json");
  const repository = new FileLatestInsightRepository(file);

  await repository.replaceForUser(
    createSnapshot({ id: "old", userId: "u1", sourceFingerprint: "old" })
  );
  await repository.replaceForUser(
    createSnapshot({ id: "new", userId: "u1", sourceFingerprint: "new" })
  );
  await repository.replaceForUser(
    createSnapshot({ id: "other", userId: "u2", sourceFingerprint: "other" })
  );

  assert.equal((await repository.findByUserId("u1"))?.id, "new");
  assert.equal(
    (await new FileLatestInsightRepository(file).findByUserId("u2"))?.id,
    "other"
  );
});

test("repository returns null for an unknown user", async () => {
  const repository = new FileLatestInsightRepository(
    join(await createTemporaryDirectory(), "latest.json")
  );

  assert.equal(await repository.findByUserId("missing"), null);
});

test("repository returns clones from public reads", async () => {
  const repository = await createRepositoryWithSnapshot("current");
  const read = await repository.findByUserId("u1");
  assert.ok(read);
  read.actions[0].completed = true;

  assert.equal(
    (await repository.findByUserId("u1"))?.actions[0].completed,
    false
  );
});

test("replacing the same fingerprint is idempotent", async () => {
  const repository = await createRepositoryWithSnapshot("current");
  const replacement = createSnapshot({
    id: "replacement",
    sourceFingerprint: "fingerprint-current",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  });

  const result = await repository.replaceForUser(replacement);

  assert.equal(result.id, "current");
  assert.equal(result.createdAt, "2026-08-13T00:00:00.000Z");
  assert.equal(result.updatedAt, "2026-08-13T00:00:00.000Z");
  assert.equal((await repository.findByUserId("u1"))?.id, "current");
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
  assert.notEqual(updated.updatedAt, "2026-08-13T00:00:00.000Z");
});

test("action completion is cleared with its completion timestamp", async () => {
  const repository = await createRepositoryWithSnapshot("current");
  await repository.updateActionState("u1", "current", "action-1", true);

  const updated = await repository.updateActionState(
    "u1",
    "current",
    "action-1",
    false
  );

  assert.equal(updated.actions[0].completed, false);
  assert.equal(updated.actions[0].completedAt, null);
});

test("action update rejects an unknown snapshot or action", async () => {
  const repository = await createRepositoryWithSnapshot("current");

  await assert.rejects(
    repository.updateActionState("missing", "current", "action-1", true),
    InsightNotFoundError
  );
  await assert.rejects(
    repository.updateActionState("u1", "current", "missing", true),
    InsightNotFoundError
  );
});

test("corrupt JSON is reported and never overwritten", async () => {
  const file = await createFileContaining("{broken");
  const repository = new FileLatestInsightRepository(file);

  await assert.rejects(
    repository.findByUserId("u1"),
    InsightRepositoryCorruptError
  );
  await assert.rejects(
    repository.replaceForUser(createSnapshot({ id: "new", userId: "u1" })),
    InsightRepositoryCorruptError
  );
  assert.equal(await readFile(file, "utf8"), "{broken");
});

test("the write queue continues after a rejected write", async () => {
  const file = await createFileContaining("{broken");
  const repository = new FileLatestInsightRepository(file);

  await assert.rejects(
    repository.replaceForUser(createSnapshot({ id: "first", userId: "u1" })),
    InsightRepositoryCorruptError
  );
  await writeFile(file, JSON.stringify({ version: 1, insights: {} }), "utf8");

  assert.equal(
    (
      await repository.replaceForUser(
        createSnapshot({ id: "second", userId: "u1" })
      )
    ).id,
    "second"
  );
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

test("equal request timestamps use lexical request IDs as a tie-breaker", () => {
  const guard = new InsightGenerationGuard();
  const later = { userId: "u1", requestId: "z-request", startedAt: 10 };
  const earlier = { userId: "u1", requestId: "a-request", startedAt: 10 };

  assert.equal(guard.claim(later), true);
  assert.equal(guard.claim(earlier), false);
  assert.equal(guard.isCurrent(later), true);
});

async function createRepositoryWithSnapshot(id: string) {
  const repository = new FileLatestInsightRepository(
    join(await createTemporaryDirectory(), "latest.json")
  );
  await repository.replaceForUser(
    createSnapshot({ id, sourceFingerprint: `fingerprint-${id}` })
  );
  return repository;
}

async function createFileContaining(contents: string): Promise<string> {
  const file = join(await createTemporaryDirectory(), "latest.json");
  await writeFile(file, contents, "utf8");
  return file;
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "luminax-insights-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createSnapshot(
  overrides: Partial<InsightSnapshot> = {}
): InsightSnapshot {
  return {
    id: "insight-1",
    userId: "u1",
    sourceQuestion: "Why did sales decline?",
    sourceIntent: "order_trend",
    scope: {
      storeIds: ["S001"],
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      comparisonLabel: "previous period",
    },
    headline: "Orders declined",
    findings: [],
    evidence: [],
    verificationItems: [],
    actions: [createAction()],
    accessRequirements: [],
    sourceFingerprint: "fingerprint-1",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function createAction(): InsightAction {
  return {
    id: "action-1",
    priority: "P1",
    title: "Review channel performance",
    ownerRole: "manager" as InsightAction["ownerRole"],
    verificationMetricCode: "orders",
    verificationMetricLabel: "Orders",
    completed: false,
    completedAt: null,
  };
}
