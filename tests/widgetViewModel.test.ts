import assert from "node:assert/strict";
import { buildWidgetViewModel, isWidgetSelfWindow } from "../src/app/widget/widgetViewModel.ts";
import type { AppSettings } from "../src/shared/settings/appSettings.ts";
import type {
  TrackerHealthSnapshot,
  TrackingStatusSnapshot,
  TrackingWindowSnapshot,
} from "../src/shared/types/tracking.ts";

const BASE_SETTINGS: AppSettings = {
  idle_timeout_secs: 900,
  timeline_merge_gap_secs: 180,
  refresh_interval_secs: 1,
  min_session_secs: 120,
  tracking_paused: false,
  close_behavior: "exit",
  minimize_behavior: "widget",
  launch_at_login: true,
  start_minimized: true,
  onboarding_completed: true,
};

const BASE_TRACKING_STATUS: TrackingStatusSnapshot = {
  is_tracking_active: true,
  sustained_participation_eligible: false,
  sustained_participation_active: false,
  sustained_participation_kind: null,
  sustained_participation_state: "inactive",
  sustained_participation_signal_source: null,
  sustained_participation_reason: "no-signal",
  sustained_participation_diagnostics: {
    state: "inactive",
    reason: "no-signal",
    window_identity: null,
    effective_signal_source: null,
    last_match_at_ms: null,
    grace_deadline_ms: null,
    system_media: {
      signal: {
        is_available: false,
        is_active: false,
        signal_source: null,
        source_app_id: null,
        source_app_identity: null,
        playback_type: null,
      },
      match_result: "unavailable",
    },
    audio_session: {
      signal: {
        is_available: false,
        is_active: false,
        signal_source: null,
        source_app_id: null,
        source_app_identity: null,
        playback_type: null,
      },
      match_result: "unavailable",
    },
  },
};

const BASE_TRACKER_HEALTH: TrackerHealthSnapshot = {
  status: "healthy",
  lastHeartbeatMs: 1,
  checkedAtMs: 2,
  staleAfterMs: 3,
};

const ACTIVE_WINDOW: TrackingWindowSnapshot = {
  hwnd: "1",
  root_owner_hwnd: "1",
  process_id: 7,
  window_class: "Chrome_WidgetWin_1",
  title: "Docs",
  exe_name: "chrome.exe",
  process_path: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  is_afk: false,
  idle_time_ms: 0,
};

const UNTRACKED_WINDOW: TrackingWindowSnapshot = {
  ...ACTIVE_WINDOW,
  exe_name: "explorer.exe",
  process_path: "C:/Windows/explorer.exe",
};

const WIDGET_WINDOW: TrackingWindowSnapshot = {
  ...ACTIVE_WINDOW,
  title: "Time Tracker Widget",
  exe_name: "time-tracker.exe",
  process_path: "C:/Program Files/Time Tracker/time-tracker.exe",
};

let passed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await runTest("buildWidgetViewModel maps healthy active tracking to tracking state", () => {
  const viewModel = buildWidgetViewModel(
    ACTIVE_WINDOW,
    BASE_TRACKING_STATUS,
    BASE_SETTINGS,
    BASE_TRACKER_HEALTH,
  );

  assert.equal(viewModel.statusTone, "tracking");
  assert.equal(viewModel.statusLabel, "\u8ffd\u8e2a\u4e2d");
  assert.equal(viewModel.appName, "Google Chrome");
  assert.equal(viewModel.pauseActionLabel, "\u6682\u505c");
  assert.equal(viewModel.showObjectSlot, true);
  assert.equal(viewModel.objectIconKey, "chrome.exe");
});

await runTest("buildWidgetViewModel distinguishes sustained participation tracking", () => {
  const viewModel = buildWidgetViewModel(
    ACTIVE_WINDOW,
    {
      ...BASE_TRACKING_STATUS,
      sustained_participation_eligible: true,
      sustained_participation_active: true,
      sustained_participation_kind: "video",
      sustained_participation_state: "active",
      sustained_participation_signal_source: "system-media",
      sustained_participation_reason: "signal-matched",
    },
    BASE_SETTINGS,
    BASE_TRACKER_HEALTH,
  );

  assert.equal(viewModel.statusTone, "tracking-sustained");
  assert.equal(viewModel.statusLabel, "\u6301\u7eed\u53c2\u4e0e");
  assert.equal(viewModel.showObjectSlot, true);
  assert.equal(viewModel.objectIconKey, "chrome.exe");
});

await runTest("buildWidgetViewModel prioritizes paused state", () => {
  const viewModel = buildWidgetViewModel(
    ACTIVE_WINDOW,
    BASE_TRACKING_STATUS,
    { ...BASE_SETTINGS, tracking_paused: true },
    BASE_TRACKER_HEALTH,
  );

  assert.equal(viewModel.statusTone, "paused");
  assert.equal(viewModel.statusLabel, "\u5df2\u6682\u505c");
  assert.equal(viewModel.pauseActionLabel, "\u6062\u590d");
  assert.equal(viewModel.showObjectSlot, false);
  assert.equal(viewModel.objectIconKey, null);
});

await runTest("buildWidgetViewModel treats afk or inactive tracking as idle", () => {
  const idleViewModel = buildWidgetViewModel(
    { ...ACTIVE_WINDOW, is_afk: true },
    BASE_TRACKING_STATUS,
    BASE_SETTINGS,
    BASE_TRACKER_HEALTH,
  );
  assert.equal(idleViewModel.statusTone, "idle");
  assert.equal(idleViewModel.statusLabel, "\u7a7a\u95f2");
  assert.equal(idleViewModel.showObjectSlot, false);

  const inactiveViewModel = buildWidgetViewModel(
    ACTIVE_WINDOW,
    { ...BASE_TRACKING_STATUS, is_tracking_active: false },
    BASE_SETTINGS,
    BASE_TRACKER_HEALTH,
  );
  assert.equal(inactiveViewModel.statusTone, "idle");
  assert.equal(inactiveViewModel.showObjectSlot, false);
});

await runTest("buildWidgetViewModel hides untracked foreground apps behind idle copy", () => {
  const viewModel = buildWidgetViewModel(
    UNTRACKED_WINDOW,
    BASE_TRACKING_STATUS,
    BASE_SETTINGS,
    BASE_TRACKER_HEALTH,
  );

  assert.equal(viewModel.statusTone, "idle");
  assert.equal(viewModel.statusLabel, "\u7a7a\u95f2");
  assert.equal(viewModel.appName, "\u5f53\u524d\u5e94\u7528\u4e0d\u8ffd\u8e2a");
  assert.equal(viewModel.helperText, "\u5f53\u524d\u7a97\u53e3\u4e0d\u4f1a\u8fdb\u5165\u8bb0\u5f55");
  assert.equal(viewModel.showObjectSlot, false);
});

await runTest("buildWidgetViewModel prioritizes stale tracker health as error", () => {
  const viewModel = buildWidgetViewModel(
    ACTIVE_WINDOW,
    BASE_TRACKING_STATUS,
    BASE_SETTINGS,
    { ...BASE_TRACKER_HEALTH, status: "stale" },
  );

  assert.equal(viewModel.statusTone, "error");
  assert.equal(viewModel.statusLabel, "\u5f02\u5e38");
  assert.equal(viewModel.showObjectSlot, false);
});

await runTest("isWidgetSelfWindow detects widget chrome without matching real apps", () => {
  assert.equal(isWidgetSelfWindow(WIDGET_WINDOW), true);
  assert.equal(isWidgetSelfWindow(ACTIVE_WINDOW), false);
});

console.log(`Passed ${passed} widget view model tests`);
