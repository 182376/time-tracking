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
    error_stage: null,
    downloaded_bytes: null,
    total_bytes: null,
    release_page_url: "https://github.com/182376/time-tracking/releases",
    asset_download_url: null,
    ...overrides,
  };
}

let passed = 0;

function runTest(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

runTest("available uses download action and shows sidebar entry", () => {
  const snapshot = makeSnapshot({
    status: "available",
    latest_version: "0.1.1",
    asset_download_url: "https://example.com/update.exe",
  });
  const panel = buildUpdateStatusPanelModel(snapshot, false, false);

  assert.equal(panel.primaryAction.label, "立即下载");
  assert.equal(panel.primaryAction.action, "open_confirm");
  assert.equal(panel.secondaryAction, null);
  assert.equal(shouldShowSidebarUpdateEntry(snapshot), true);
  assert.equal(panel.progress, null);
});

runTest("up-to-date uses check action without sidebar entry", () => {
  const snapshot = makeSnapshot({ status: "up_to_date" });
  const panel = buildUpdateStatusPanelModel(snapshot, false, false);

  assert.equal(panel.primaryAction.label, "检查更新");
  assert.equal(panel.primaryAction.action, "check");
  assert.equal(panel.secondaryAction, null);
  assert.equal(shouldShowSidebarUpdateEntry(snapshot), false);
});

runTest("download error prefers direct package download and keeps retry secondary action", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "error",
    error_stage: "download",
    error_message: "failed to download update: timeout",
    latest_version: "0.2.3",
    asset_download_url: "https://example.com/update.exe",
  }), false, false);

  assert.equal(panel.statusTitle, "无法下载安装包");
  assert.equal(panel.primaryAction.action, "open_download_url");
  assert.equal(panel.secondaryAction?.action, "check");
});

runTest("check error falls back to release page", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "error",
    error_stage: "check",
    error_message: "failed to check updates: network offline",
  }), false, false);

  assert.equal(panel.statusTitle, "无法检查更新");
  assert.equal(panel.primaryAction.action, "open_release_page");
  assert.equal(panel.secondaryAction?.action, "check");
});

runTest("checking uses disabled loading action", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({ status: "checking" }), true, false);
  assert.equal(panel.primaryAction.label, "检查中...");
  assert.equal(panel.primaryAction.disabled, true);
  assert.equal(panel.primaryAction.loading, true);
});

runTest("downloading builds determinate progress when total is known", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "downloading",
    latest_version: "0.2.0",
    downloaded_bytes: 512,
    total_bytes: 1024,
  }), false, true);

  assert.equal(panel.progress?.valueText, "50%");
  assert.equal(panel.progress?.indeterminate, false);
  assert.equal(shouldShowSidebarUpdateEntry(makeSnapshot({ status: "downloading" })), true);
});

runTest("downloading without byte progress stays indeterminate", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "downloading",
    latest_version: "0.2.0",
  }), false, true);

  assert.equal(panel.progress?.label, "正在获取进度");
  assert.equal(panel.progress?.valueText, null);
  assert.equal(panel.progress?.indeterminate, true);
});

runTest("confirm dialog opens for active update states and structured error states", () => {
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "available" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "downloaded" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "downloading" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({ status: "installing" })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({
    status: "error",
    error_stage: "download",
    latest_version: "0.2.0",
  })), true);
  assert.equal(shouldOpenUpdateDialogForSnapshot(makeSnapshot({
    status: "error",
    error_stage: null,
    release_page_url: null,
    asset_download_url: null,
    latest_version: null,
  })), false);
});

runTest("confirm dialog model includes notes preview", () => {
  const model = buildUpdateConfirmDialogModel(makeSnapshot({
    status: "available",
    latest_version: "0.2.0",
    release_notes: "A".repeat(260),
  }));
  assert.equal(model.title, "发现新版本");
  assert.equal(model.primaryAction?.label, "立即下载");
  assert.equal(model.versionCompareLabel, "v0.1.0 -> v0.2.0");
  assert.ok(model.notesPreview !== null);
  assert.ok(model.notesPreview!.length <= 223);
});

runTest("confirm dialog shows progress while downloading", () => {
  const model = buildUpdateConfirmDialogModel(makeSnapshot({
    status: "downloading",
    latest_version: "0.2.0",
    downloaded_bytes: 768,
    total_bytes: 1024,
  }));

  assert.equal(model.title, "正在下载更新");
  assert.equal(model.progress?.valueText, "75%");
  assert.equal(model.progress?.indeterminate, false);
});

runTest("confirm dialog shows manual fallback actions for download errors", () => {
  const model = buildUpdateConfirmDialogModel(makeSnapshot({
    status: "error",
    error_stage: "download",
    error_message: "failed to download update",
    latest_version: "0.2.3",
    asset_download_url: "https://example.com/update.exe",
  }));

  assert.equal(model.title, "下载更新失败");
  assert.equal(model.primaryAction?.action, "open_download_url");
  assert.equal(model.secondaryAction?.action, "check");
});

runTest("install error keeps retry install as primary action", () => {
  const panel = buildUpdateStatusPanelModel(makeSnapshot({
    status: "error",
    error_stage: "install",
    error_message: "failed to install update",
    latest_version: "0.2.3",
    asset_download_url: "https://example.com/update.exe",
  }), false, false);

  assert.equal(panel.primaryAction.action, "open_confirm");
  assert.equal(panel.primaryAction.label, "再次安装");
  assert.equal(panel.secondaryAction?.action, "open_download_url");
});

console.log(`Passed ${passed} update view model tests`);
