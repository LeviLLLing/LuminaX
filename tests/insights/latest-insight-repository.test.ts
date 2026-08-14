import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileLatestInsightRepository,
  InsightConditionalWriteError,
  InsightConflictError,
  type LatestInsightFileSystem,
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

test("conditional replacement restores the previous snapshot when superseded during commit", async () => {
  const file = join(await createTemporaryDirectory(), "latest.json");
  const seedRepository = new FileLatestInsightRepository(file);
  await seedRepository.replaceForUser(
    createSnapshot({ id: "old", sourceFingerprint: "old" })
  );

  let current = true;
  let renameCount = 0;
  const repository = new FileLatestInsightRepository(
    file,
    createFileSystem({
      async rename(oldPath, newPath) {
        await rename(oldPath, newPath);
        renameCount += 1;
        if (renameCount === 1) current = false;
      },
    })
  );

  await assert.rejects(
    repository.replaceForUser(
      createSnapshot({ id: "new", sourceFingerprint: "new" }),
      () => current
    ),
    InsightConditionalWriteError
  );

  assert.equal((await repository.findByUserId("u1"))?.id, "old");
  assert.equal(renameCount, 2);
});

test("repository serializes concurrent replacements without losing users", async () => {
  const file = join(await createTemporaryDirectory(), "latest.json");
  const repository = new FileLatestInsightRepository(file);

  await Promise.all(
    ["u1", "u2", "u3"].map((userId) =>
      repository.replaceForUser(
        createSnapshot({
          id: `insight-${userId}`,
          sourceFingerprint: `fingerprint-${userId}`,
          userId,
        })
      )
    )
  );

  assert.deepEqual(
    await Promise.all(
      ["u1", "u2", "u3"].map(async (userId) =>
        (await repository.findByUserId(userId))?.id
      )
    ),
    ["insight-u1", "insight-u2", "insight-u3"]
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

test("invalid nested registry data is reported and never overwritten", async () => {
  const invalidSnapshots = [
    (snapshot: Record<string, unknown>) => {
      snapshot.findings = [null];
    },
    (snapshot: Record<string, unknown>) => {
      snapshot.accessRequirements = [{}];
    },
    (snapshot: Record<string, unknown>) => {
      (snapshot.findings as Array<Record<string, unknown>>)[0].severity = "urgent";
    },
    (snapshot: Record<string, unknown>) => {
      snapshot.updatedAt = "not-a-timestamp";
    },
  ];

  for (const makeInvalid of invalidSnapshots) {
    const snapshot = structuredClone(createSnapshot()) as unknown as Record<
      string,
      unknown
    >;
    makeInvalid(snapshot);
    const contents = JSON.stringify({ version: 1, insights: { u1: snapshot } });
    const file = await createFileContaining(contents);
    const repository = new FileLatestInsightRepository(file);

    await assert.rejects(
      repository.findByUserId("u1"),
      InsightRepositoryCorruptError
    );
    await assert.rejects(
      repository.replaceForUser(createSnapshot({ id: "new", userId: "u1" })),
      InsightRepositoryCorruptError
    );
    assert.equal(await readFile(file, "utf8"), contents);
  }
});

test("repository accepts every supported insight owner role", async () => {
  const ownerRoles = ["区域经理", "店长", "运营", "财务", "数据分析"] as const;
  const snapshot = createSnapshot({
    actions: ownerRoles.map((ownerRole, index) => ({
      ...createAction(),
      id: `action-${index + 1}`,
      ownerRole: ownerRole as InsightAction["ownerRole"],
    })),
  });
  const file = await createFileContaining(
    JSON.stringify({ version: 1, insights: { u1: snapshot } })
  );

  const restored = await new FileLatestInsightRepository(file).findByUserId("u1");

  assert.deepEqual(restored?.actions.map((action) => action.ownerRole), ownerRoles);
});

test("repository rejects unknown and corrupt insight owner roles", async () => {
  for (const ownerRole of ["未知角色", "杩愯惀"]) {
    const snapshot = structuredClone(createSnapshot()) as unknown as Record<
      string,
      unknown
    >;
    (snapshot.actions as Array<Record<string, unknown>>)[0].ownerRole = ownerRole;
    const file = await createFileContaining(
      JSON.stringify({ version: 1, insights: { u1: snapshot } })
    );

    await assert.rejects(
      new FileLatestInsightRepository(file).findByUserId("u1"),
      InsightRepositoryCorruptError
    );
  }
});

test("non-finite numeric evidence in persisted JSON is reported as corrupt", async () => {
  const snapshot = createSnapshot();
  const contents = JSON.stringify({ version: 1, insights: { u1: snapshot } }).replace(
    '"value":12.4',
    '"value":1e9999'
  );
  const file = await createFileContaining(contents);

  await assert.rejects(
    new FileLatestInsightRepository(file).findByUserId("u1"),
    InsightRepositoryCorruptError
  );
  assert.equal(await readFile(file, "utf8"), contents);
});

test("failed rename removes the temporary registry file", async () => {
  const directory = await createTemporaryDirectory();
  const renameFailure = new Error("rename failed");
  const repository = new FileLatestInsightRepository(
    join(directory, "latest.json"),
    createFileSystem({
      rename: async () => {
        throw renameFailure;
      },
    })
  );

  await assert.rejects(
    repository.replaceForUser(createSnapshot()),
    renameFailure
  );
  assert.deepEqual(await readdir(directory), []);
});

test("failed temporary cleanup preserves the rename failure", async () => {
  const directory = await createTemporaryDirectory();
  const renameFailure = new Error("rename failed");
  const cleanupFailure = new Error("cleanup failed");
  const repository = new FileLatestInsightRepository(
    join(directory, "latest.json"),
    createFileSystem({
      rename: async () => {
        throw renameFailure;
      },
      rm: async () => {
        throw cleanupFailure;
      },
    })
  );

  await assert.rejects(repository.replaceForUser(createSnapshot()), (error) => {
    assert.equal(error, renameFailure);
    return true;
  });
});

test("frozen rename errors survive failed temporary cleanup", async () => {
  const directory = await createTemporaryDirectory();
  const renameFailure = Object.freeze(new Error("rename failed"));
  const repository = new FileLatestInsightRepository(
    join(directory, "latest.json"),
    createFileSystem({
      rename: async () => {
        throw renameFailure;
      },
      rm: async () => {
        throw new Error("cleanup failed");
      },
    })
  );

  await assert.rejects(repository.replaceForUser(createSnapshot()), (error) => {
    assert.equal(error, renameFailure);
    assert.equal((error as Error).message, "rename failed");
    return true;
  });
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
    findings: [
      {
        id: "finding-1",
        title: "Order decline",
        summary: "Orders fell compared with the previous period.",
        severity: "high",
        confidence: "high",
        subjectIds: ["S001"],
        metricCode: "orders",
        value: -12.4,
        unit: "%",
        displayValue: "-12.4%",
        evidenceIds: ["evidence-1"],
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        type: "period_variance",
        title: "Period variance",
        supportsFindingIds: ["finding-1"],
        unit: "%",
        baselineLabel: "Previous period",
        series: [
          {
            key: "current",
            label: "Current",
            value: 12.4,
            baseline: 0,
            direction: "negative",
          },
        ],
        interpretation: "Orders were below baseline.",
      },
    ],
    verificationItems: [
      {
        id: "verification-1",
        observedFact: "Orders declined.",
        hypothesis: "A channel underperformed.",
        requiredCheck: "Check channel contribution.",
      },
    ],
    actions: [createAction()],
    accessRequirements: [{ tableName: "sales", columns: ["orders"] }],
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
    ownerRole: "运营",
    verificationMetricCode: "orders",
    verificationMetricLabel: "Orders",
    completed: false,
    completedAt: null,
  };
}

function createFileSystem(
  overrides: Partial<LatestInsightFileSystem>
): LatestInsightFileSystem {
  return {
    mkdir,
    readFile,
    writeFile,
    rename,
    rm,
    ...overrides,
  };
}
