import assert from "node:assert/strict";
import {
  buildUpdateConfirmDialogModel,
  buildUpdateStatusPanelModel,
  shouldOpenUpdateDialogForSnapshot,
  shouldShowSidebarUpdateEntry,
} from "../src/features/update/services/updateViewModel.ts";
import type { UpdateSnapshot } from "../src/shared/types/update.ts";

function makeSnapshot(overrides: Partial<UpdateSnapshot> = {}): UpdateSnapshot {
  return {
    current_version: "0.1.0",
    status: "idle",
    latest_version: null,
    release_notes: null,
    release_date: null,
    error_message: null,
    ...overrides,
  };
}

let passed = 0;

function runTest(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

runTest("available uses update action and shows sidebar entry", () => {
  const snapshot = makeSnapshot({ status: "available", latest_version: "0.1.1" });
  const panel = buildUpdateStatusPanelModel(snapshot, false, false);

  assert.equal(panel.primaryAction.label, "立即更新");
  assert.equal(panel.primaryAction.action, "open_confirm");
  assert.equal(shouldShowSidebarUpdateEntry(snapshot), true);
});

runTest("up-to-date uses check action without sidebar entry", () => {
  const snapshot = makeSnapshot({ status: "up_to_date" });
  const panel = buildUpdateStatusPanelModel(snapshot, false, false);

  assert.equal(panel.primaryAction.label, "检查更新");
  assert.equal(panel.primaryAction.action, "check");
  assert.equal(shouldShowSidebarUpdateEntry(snapshot), false);
});

runTest("error uses retry action", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "error",
    error_message: "network unavailable",
  }), false, false);

  assert.equal(panel.primaryAction.label, "重新检查");
  assert.equal(panel.primaryAction.action, "check");
});

runTest("checking uses disabled loading action", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({ status: "checking" }), true, false);
  assert.equal(panel.primaryAction.label, "检查中...");
  assert.equal(panel.primaryAction.disabled, true);
  assert.equal(panel.primaryAction.loading, true);
});

runTest("confirm dialog opens only for available/downloaded", () => {
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "available" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "downloaded" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "up_to_date" })), false);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "error" })), false);
});

runTest("confirm dialog model includes notes preview", () => {
  const model = buildUpdateConfirmDialogModel(makeSnapshot({
    status: "available",
    latest_version: "0.2.0",
    release_notes: "A".repeat(260),
  }));
  assert.equal(model.title, "发现新版本");
  assert.equal(model.confirmLabel, "立即更新");
  assert.equal(model.versionCompareLabel, "v0.1.0 → v0.2.0");
  assert.ok(model.notesPreview !== null);
  assert.ok(model.notesPreview!.length <= 223);
});

console.log(`Passed ${passed} update view model tests`);
