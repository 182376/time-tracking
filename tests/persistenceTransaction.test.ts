import assert from "node:assert/strict";
import {
  createSerializedJobRunner,
  executeWriteBatchWithExecutor,
  isRecoverableSqliteWriteError,
  type SqlWriteOperation,
} from "../src/platform/persistence/sqliteTransactions.ts";
import { buildClassificationDraftChangePlan } from "../src/features/classification/services/classificationDraftState.ts";
import { buildCommitDraftChangePlanOperations } from "../src/features/classification/services/classificationStore.ts";
import {
  buildRawAppSettingsPatch,
  buildSaveSettingEntryOperations,
} from "../src/platform/persistence/appSettingsStore.ts";
import {
  buildClassificationSettingMutationOperations,
  isCommitClassificationSettingsCommandUnavailable,
} from "../src/platform/persistence/classificationSettingsGateway.ts";

class FakeWriteExecutor {
  executedStatements: Array<{ query: string; values?: unknown[] }> = [];
  private mutationCount = 0;
  private readonly failAtMutationNumber: number | null;

  constructor(failAtMutationNumber: number | null = null) {
    this.failAtMutationNumber = failAtMutationNumber;
  }

  async execute(query: string, values?: unknown[]): Promise<void> {
    this.mutationCount += 1;
    if (this.failAtMutationNumber !== null && this.mutationCount === this.failAtMutationNumber) {
      throw new Error(`forced failure at mutation ${this.mutationCount}`);
    }

    this.executedStatements.push({ query, values });
  }
}

let passed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function assertNoTransactionControlStatements(executor: FakeWriteExecutor) {
  const transactionControlStatements = new Set(["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"]);
  assert.equal(
    executor.executedStatements.some((statement) => transactionControlStatements.has(statement.query)),
    false,
  );
}

await runTest("executeWriteBatchWithExecutor executes all operations in order", async () => {
  const executor = new FakeWriteExecutor();
  const operations: SqlWriteOperation[] = [
    { query: "INSERT setting A", values: ["a"] },
    { query: "INSERT setting B", values: ["b"] },
  ];

  await executeWriteBatchWithExecutor(executor, operations);

  assert.deepEqual(executor.executedStatements, operations);
  assertNoTransactionControlStatements(executor);
});

await runTest("executeWriteBatchWithExecutor stops after the first failed operation", async () => {
  const executor = new FakeWriteExecutor(2);
  const operations: SqlWriteOperation[] = [
    { query: "INSERT setting A", values: ["a"] },
    { query: "INSERT setting B", values: ["b"] },
    { query: "INSERT setting C", values: ["c"] },
  ];

  await assert.rejects(
    executeWriteBatchWithExecutor(executor, operations),
    /forced failure at mutation 2/,
  );

  assert.deepEqual(executor.executedStatements, [operations[0]]);
  assertNoTransactionControlStatements(executor);
});

await runTest("classification batch operations stop on the first failed write", async () => {
  const executor = new FakeWriteExecutor(2);
  const operations = buildCommitDraftChangePlanOperations(buildClassificationDraftChangePlan({
    overrides: {},
    categoryColorOverrides: {},
    customCategories: [],
    deletedCategories: [],
  }, {
    overrides: {
      "chrome.exe": {
        enabled: true,
        displayName: "Work Browser",
      },
    },
    categoryColorOverrides: {
      development: "#112233",
    },
    customCategories: [],
    deletedCategories: ["music"],
  }));

  assert.ok(operations.length >= 3);
  await assert.rejects(
    executeWriteBatchWithExecutor(executor, operations),
    /forced failure at mutation 2/,
  );

  assert.deepEqual(executor.executedStatements, [operations[0]]);
  assertNoTransactionControlStatements(executor);
});

await runTest("settings batch operations stop on the first failed write", async () => {
  const executor = new FakeWriteExecutor(2);
  const operations = buildSaveSettingEntryOperations(buildRawAppSettingsPatch({
    trackingPaused: true,
    timelineMergeGapSecs: 180,
    refreshIntervalSecs: 2,
  }));

  assert.ok(operations.length >= 3);
  await assert.rejects(
    executeWriteBatchWithExecutor(executor, operations),
    /forced failure at mutation 2/,
  );

  assert.deepEqual(executor.executedStatements, [operations[0]]);
  assertNoTransactionControlStatements(executor);
});

await runTest("SQLite transient write errors are recoverable", () => {
  assert.equal(isRecoverableSqliteWriteError("database is locked"), true);
  assert.equal(isRecoverableSqliteWriteError(new Error("SQLITE_BUSY: database is busy")), true);
  assert.equal(isRecoverableSqliteWriteError("UNIQUE constraint failed: settings.key"), false);
});

await runTest("classification setting mutation fallback builds ordered writes", () => {
  assert.deepEqual(buildClassificationSettingMutationOperations([
    { key: "__app_override::chrome.exe", value: "{\"enabled\":true}" },
    { key: "__category_color_override::video", value: null },
  ]), [
    {
      query: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      values: ["__app_override::chrome.exe", "{\"enabled\":true}"],
    },
    {
      query: "DELETE FROM settings WHERE key = ?",
      values: ["__category_color_override::video"],
    },
  ]);
});

await runTest("classification setting command fallback only catches missing command", () => {
  assert.equal(
    isCommitClassificationSettingsCommandUnavailable(
      "Command cmd_commit_classification_settings not found",
    ),
    true,
  );
  assert.equal(
    isCommitClassificationSettingsCommandUnavailable({
      message: "unknown command: cmd_commit_classification_settings",
    }),
    true,
  );
  assert.equal(
    isCommitClassificationSettingsCommandUnavailable("database is locked"),
    false,
  );
});

await runTest("createSerializedJobRunner keeps writes strictly ordered", async () => {
  const runSerializedJob = createSerializedJobRunner();
  const events: string[] = [];

  const slowJob = runSerializedJob(async () => {
    events.push("slow:start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push("slow:end");
  });

  const fastJob = runSerializedJob(async () => {
    events.push("fast:start");
    events.push("fast:end");
  });

  await Promise.all([slowJob, fastJob]);

  assert.deepEqual(events, [
    "slow:start",
    "slow:end",
    "fast:start",
    "fast:end",
  ]);
});

console.log(`Passed ${passed} persistence transaction tests`);
