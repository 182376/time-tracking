import assert from "node:assert/strict";
import {
  isTrackableWindow,
  planWindowTransition,
  resolveStartupSealTime,
} from "../src/shared/lib/trackingWindowLifecycle.ts";
import {
  buildDailySummaries,
  buildNormalizedAppStats,
  buildTimelineSessions,
  compileSessions,
  getDayRange,
  getRollingDayRanges,
} from "../src/shared/lib/sessionReadCompiler.ts";
import { HistoryReadModelService } from "../src/shared/lib/historyReadModelService.ts";
import type { HistorySession } from "../src/shared/lib/sessionReadRepository.ts";
import {
  isTrackingDataChangedPayload,
  resolveTrackerHealth,
  isTrackingWindowSnapshot,
  type TrackedWindow,
} from "../src/shared/types/tracking.ts";
import { ProcessMapper } from "../src/features/classification/services/ProcessMapper.ts";
import {
  resolveCanonicalDisplayName,
  resolveCanonicalExecutable,
  shouldTrackProcess,
} from "../src/features/classification/services/processNormalization.ts";

const shouldTrack = (exeName: string) => !["explorer.exe", "time_tracker.exe"].includes(exeName.toLowerCase());

function makeWindow(overrides: Partial<TrackedWindow> = {}): TrackedWindow {
  return {
    hwnd: "0x100",
    root_owner_hwnd: "0x100",
    process_id: 123,
    window_class: "Chrome_WidgetWin_1",
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
    idle_time_ms: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<HistorySession> = {}): HistorySession {
  return {
    id: 1,
    app_name: "QQ",
    exe_name: "QQ.exe",
    window_title: "QQ Chat",
    start_time: 1_000,
    end_time: 11_000,
    duration: 10_000,
    ...overrides,
  };
}

let passed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("repeated same window does not trigger session changes", () => {
  const currentWindow = makeWindow();
  const result = planWindowTransition({
    previousWindow: currentWindow,
    nextWindow: currentWindow,
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.deepEqual(result, {
    didChange: false,
    reason: "session-no-change",
    shouldEndPrevious: false,
    shouldStartNext: false,
    shouldRefreshMetadata: false,
    endTimeOverride: undefined,
  });
});

runTest("title changes inside the same executable do not trigger session changes", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat A" }),
    nextWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat B" }),
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.deepEqual(result, {
    didChange: false,
    reason: "session-metadata-refreshed",
    shouldEndPrevious: false,
    shouldStartNext: false,
    shouldRefreshMetadata: true,
    endTimeOverride: undefined,
  });
});

runTest("switching between tracked windows ends previous session and starts next", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "QQ.exe", title: "QQ Chat" }),
    nextWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Editor", process_path: "C:\\Apps\\Antigravity.exe" }),
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.equal(result.didChange, true);
  assert.equal(result.reason, "session-transition-app-change");
  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, true);
  assert.equal(result.shouldRefreshMetadata, false);
  assert.equal(result.endTimeOverride, undefined);
});

runTest("windows with a known executable but no process path are still trackable", () => {
  const chromeWindow = makeWindow({
    exe_name: "chrome.exe",
    process_path: "",
    title: "Google Chrome",
  });

  assert.equal(isTrackableWindow(chromeWindow, shouldTrack), true);
});

runTest("afk transition backdates end time and does not start a new session", () => {
  const nowMs = 1_000_000;
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Coding" }),
    nextWindow: makeWindow({
      exe_name: "explorer.exe",
      title: "Explorer",
      process_path: "C:\\Windows\\explorer.exe",
      is_afk: true,
      idle_time_ms: 300_000,
    }),
    nowMs,
    shouldTrack,
  });

  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, false);
  assert.equal(result.shouldRefreshMetadata, false);
  assert.equal(result.endTimeOverride, nowMs - 300_000);
});

runTest("same app different top-level window keeps one session but refreshes metadata", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({
      hwnd: "0x100",
      root_owner_hwnd: "0x100",
      title: "Chat A",
    }),
    nextWindow: makeWindow({
      hwnd: "0x200",
      root_owner_hwnd: "0x200",
      title: "Chat B",
    }),
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.equal(result.didChange, false);
  assert.equal(result.reason, "session-metadata-refreshed");
  assert.equal(result.shouldEndPrevious, false);
  assert.equal(result.shouldStartNext, false);
  assert.equal(result.shouldRefreshMetadata, true);
});

runTest("startup sealing prefers the last stored heartbeat over current startup time", () => {
  const endTime = resolveStartupSealTime({
    sessionStartTime: 1_000,
    lastHeartbeatMs: 8_000,
    nowMs: 20_000,
  });

  assert.equal(endTime, 8_000);
});

runTest("startup sealing clamps invalid heartbeat values to the current startup boundary", () => {
  const futureHeartbeat = resolveStartupSealTime({
    sessionStartTime: 1_000,
    lastHeartbeatMs: 30_000,
    nowMs: 20_000,
  });
  const missingHeartbeat = resolveStartupSealTime({
    sessionStartTime: 5_000,
    lastHeartbeatMs: null,
    nowMs: 20_000,
  });

  assert.equal(futureHeartbeat, 20_000);
  assert.equal(missingHeartbeat, 20_000);
});

runTest("normalized app stats keep different executables separate even if display names match", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", duration: 120_000, end_time: 121_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 200_000, end_time: 320_000, duration: 120_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 400_000,
    minSessionSecs: 30,
  });

  const stats = buildNormalizedAppStats(compiled);

  assert.equal(stats.length, 2);
  assert.deepEqual(
    stats.map((item) => item.exe_name).sort(),
    ["QQ.exe", "QQNT.exe"].sort(),
  );
});

runTest("normalized app stats merge known alias executables into one app group", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "douyin.exe", app_name: "抖音", start_time: 0, end_time: 120_000, duration: 120_000 }),
    makeSession({ id: 2, exe_name: "DouYin_Tray.exe", app_name: "Douyin_tray", start_time: 130_000, end_time: 190_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 300_000,
    minSessionSecs: 0,
  });
  const stats = buildNormalizedAppStats(compiled);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].exe_name.toLowerCase(), "douyin.exe");
  assert.equal(stats[0].app_name, resolveCanonicalDisplayName("douyin.exe"));
  assert.equal(stats[0].total_duration, 180_000);
});

runTest("alias-first sessions still use canonical display name", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "DouYin_Tray.exe", app_name: "Douyin_tray", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "douyin.exe", app_name: "抖音", start_time: 65_000, end_time: 125_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 300_000,
    minSessionSecs: 0,
  });
  const stats = buildNormalizedAppStats(compiled);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].exe_name.toLowerCase(), "douyin.exe");
  assert.equal(stats[0].app_name, resolveCanonicalDisplayName("douyin.exe"));
});

runTest("installer windows are filtered instead of collapsing into the owning app", () => {
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      exe_name: "alma-0.0.750-win-x64.exe",
      app_name: "Alma Installer",
      window_title: "Alma 安装",
      start_time: 0,
      end_time: 20_000,
      duration: 20_000,
    }),
    makeSession({
      id: 2,
      exe_name: "Alma.exe",
      app_name: "Alma",
      window_title: "Alma",
      start_time: 25_000,
      end_time: 85_000,
      duration: 60_000,
    }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 120_000,
    minSessionSecs: 0,
  });
  const stats = buildNormalizedAppStats(compiled);

  assert.equal(stats.length, 1);
  assert.equal(stats[0].exe_name.toLowerCase(), "alma.exe");
  assert.equal(stats[0].app_name, "Alma");
  assert.equal(stats[0].total_duration, 60_000);
});

runTest("non-aliased apps prefer session app_name for display", () => {
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      exe_name: "snowshot.exe",
      app_name: "Snow Shot",
      window_title: "Snow Shot",
      start_time: 0,
      end_time: 60_000,
      duration: 60_000,
    }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 120_000,
    minSessionSecs: 0,
  });
  const stats = buildNormalizedAppStats(compiled);

  assert.equal(stats.length, 1);
  assert.equal(stats[0].app_name, "Snow Shot");
});

runTest("empty executable rows are excluded from compiled sessions", () => {
  const compiled = compileSessions([
    makeSession({ id: 1, exe_name: "", app_name: "", window_title: "", start_time: 0, end_time: 60_000, duration: 60_000 }),
  ], {
    startMs: 0,
    endMs: 100_000,
    minSessionSecs: 0,
  });

  assert.equal(compiled.length, 0);
});

runTest("short same-app fragments survive when filtering happens after merge", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 20_000, duration: 20_000 }),
    makeSession({ id: 2, exe_name: "QQ.exe", start_time: 22_000, end_time: 42_000, duration: 20_000, window_title: "QQ Other" }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 100_000,
    minSessionSecs: 30,
  });

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].duration, 42_000);
});

runTest("timeline merge does not merge different executables with the same mapped display name", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 62_000, end_time: 122_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 200_000,
    minSessionSecs: 30,
  });
  const timeline = buildTimelineSessions(compiled, 180);

  assert.equal(timeline.length, 2);
  assert.deepEqual(
    timeline.map((item) => item.exe_name),
    ["QQ.exe", "QQNT.exe"],
  );
});

runTest("timeline grouping preserves active duration while extending the visible span", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 60_000, end_time: 90_000, duration: 30_000 }),
    makeSession({ id: 3, exe_name: "QQ.exe", start_time: 90_000, end_time: 150_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 200_000,
    minSessionSecs: 30,
  });
  const timeline = buildTimelineSessions(compiled, 180);

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].start_time, 0);
  assert.equal(timeline[0].end_time, 150_000);
  assert.equal(timeline[0].duration, 120_000);
});

runTest("day compilation clips cross-day sessions to the selected date", () => {
  const day = new Date(2026, 3, 4, 12, 0, 0, 0);
  const range = getDayRange(day, new Date(2026, 3, 5, 0, 0, 0, 0).getTime());
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      start_time: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
      end_time: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
      duration: 30 * 60_000,
    }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: range.startMs,
    endMs: range.endMs,
    minSessionSecs: 30,
  });

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].duration, 20 * 60_000);
});

runTest("daily summaries attribute cross-day activity to both days", () => {
  const nowMs = new Date(2026, 3, 4, 12, 0, 0, 0).getTime();
  const ranges = getRollingDayRanges(2, nowMs);
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      start_time: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
      end_time: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
      duration: 30 * 60_000,
    }),
  ];
  const summaries = buildDailySummaries(sessions, ranges, 30);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].total_duration, 10 * 60_000);
  assert.equal(summaries[1].total_duration, 20 * 60_000);
});

runTest("daily summaries stay consistent with per-day compiled totals", () => {
  const nowMs = new Date(2026, 3, 4, 12, 0, 0, 0).getTime();
  const ranges = getRollingDayRanges(3, nowMs);
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      exe_name: "QQ.exe",
      start_time: new Date(2026, 3, 2, 23, 59, 30, 0).getTime(),
      end_time: new Date(2026, 3, 3, 0, 1, 0, 0).getTime(),
      duration: 90_000,
    }),
    makeSession({
      id: 2,
      exe_name: "Chrome.exe",
      app_name: "Chrome",
      start_time: new Date(2026, 3, 4, 8, 0, 0, 0).getTime(),
      end_time: new Date(2026, 3, 4, 9, 0, 0, 0).getTime(),
      duration: 60 * 60_000,
    }),
  ];

  const summaries = buildDailySummaries(sessions, ranges, 30);
  const compiledTotals = ranges.map((range) => (
    compileSessions(sessions, {
      startMs: range.startMs,
      endMs: range.endMs,
      minSessionSecs: 30,
    }).reduce((sum, session) => sum + Math.max(0, session.duration ?? 0), 0)
  ));

  assert.deepEqual(
    summaries.map((item) => item.total_duration),
    compiledTotals,
  );
});

runTest("tracking runtime payload guards accept expected contracts", () => {
  assert.equal(isTrackingWindowSnapshot({
    hwnd: "0x100",
    root_owner_hwnd: "0x100",
    process_id: 123,
    window_class: "Chrome_WidgetWin_1",
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
    idle_time_ms: 0,
  }), true);
  assert.equal(isTrackingWindowSnapshot({
    hwnd: "0x100",
    root_owner_hwnd: "0x100",
    process_id: 123,
    window_class: "Chrome_WidgetWin_1",
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: "false",
    idle_time_ms: 0,
  }), false);
  assert.equal(isTrackingWindowSnapshot({
    root_owner_hwnd: "0x100",
    process_id: 123,
    window_class: "Chrome_WidgetWin_1",
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
    idle_time_ms: 0,
  }), false);

  assert.equal(isTrackingDataChangedPayload({
    reason: "session-transition",
    changed_at_ms: 123,
  }), true);
  assert.equal(isTrackingDataChangedPayload({
    reason: "session-transition",
    changed_at_ms: "123",
  }), false);
});

runTest("tracker health becomes stale when heartbeat exceeds grace window", () => {
  const healthy = resolveTrackerHealth(10_000, 16_000, 8_000);
  const stale = resolveTrackerHealth(10_000, 19_000, 8_000);
  const missing = resolveTrackerHealth(null, 19_000, 8_000);

  assert.equal(healthy.status, "healthy");
  assert.equal(stale.status, "stale");
  assert.equal(missing.status, "stale");
});

runTest("system windows processes are excluded from tracking", () => {
  assert.equal(ProcessMapper.shouldTrack("SearchHost.exe"), false);
  assert.equal(ProcessMapper.shouldTrack("ShellExperienceHost.exe"), false);
  assert.equal(ProcessMapper.shouldTrack("Consent.exe"), false);
  assert.equal(ProcessMapper.shouldTrack("PickerHost.exe"), false);
  assert.equal(ProcessMapper.shouldTrack("Antigravity.exe"), true);
});

runTest("process mapper can exclude an app from tracking via override", () => {
  ProcessMapper.clearUserOverrides();
  assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

  ProcessMapper.setUserOverride("QQ.exe", {
    track: false,
    enabled: true,
    updatedAt: Date.now(),
  });

  assert.equal(ProcessMapper.shouldTrack("QQ.exe"), false);
  ProcessMapper.clearUserOverrides();
});

runTest("process mapper can disable title capture per app without affecting tracking", () => {
  ProcessMapper.clearUserOverrides();
  assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

  ProcessMapper.setUserOverride("QQ.exe", {
    captureTitle: false,
    enabled: true,
    updatedAt: Date.now(),
  });

  const override = ProcessMapper.getUserOverride("QQ.exe");
  assert.equal(override?.captureTitle, false);
  assert.equal(ProcessMapper.shouldTrack("QQ.exe"), true);

  const persisted = ProcessMapper.toOverrideStorageValue({
    captureTitle: false,
    enabled: true,
    updatedAt: Date.now(),
  });
  const parsed = ProcessMapper.fromOverrideStorageValue(persisted);
  assert.equal(parsed?.captureTitle, false);

  ProcessMapper.clearUserOverrides();
});

runTest("process mapper resolves known alias executables to canonical app identity", () => {
  const mapped = ProcessMapper.map("DouYin_Tray.exe");

  assert.equal(mapped.name, "抖音");
  assert.equal(mapped.category, "video");
});

runTest("process mapper user override can reclassify an unknown app", () => {
  ProcessMapper.clearUserOverrides();
  const before = ProcessMapper.map("atlas.exe");
  assert.equal(before.category, "other");

  ProcessMapper.setUserOverride("atlas.exe", {
    category: "utility",
    enabled: true,
    updatedAt: Date.now(),
  });

  const after = ProcessMapper.map("atlas.exe");
  assert.equal(after.category, "utility");
  assert.equal(after.source, "override");

  ProcessMapper.clearUserOverrides();
});

runTest("process mapper allows assigning custom category", () => {
  ProcessMapper.clearUserOverrides();

  ProcessMapper.setUserOverride("atlas.exe", {
    category: "custom:专注",
    enabled: true,
    updatedAt: Date.now(),
  });

  const mapped = ProcessMapper.map("atlas.exe");
  assert.equal(mapped.category, "custom:%E4%B8%93%E6%B3%A8");
  assert.equal(mapped.source, "override");
  assert.equal(ProcessMapper.getCategoryLabel("custom:专注"), "专注");

  ProcessMapper.clearUserOverrides();
});

runTest("process mapper category snapshot remains stable for key desktop apps", () => {
  ProcessMapper.clearUserOverrides();
  const cases: Array<{ exeName: string; appName: string; expectedCategory: string }> = [
    { exeName: "vscodium.exe", appName: "VSCodium", expectedCategory: "development" },
    { exeName: "alma.exe", appName: "Alma", expectedCategory: "ai" },
    { exeName: "zotero.exe", appName: "Zotero", expectedCategory: "reading" },
    { exeName: "ToDesk.exe", appName: "ToDesk", expectedCategory: "utility" },
    { exeName: "HoYoPlay.exe", appName: "HoYoPlay", expectedCategory: "game" },
    { exeName: "atlas.exe", appName: "Atlas", expectedCategory: "other" },
  ];

  for (const item of cases) {
    const mapped = ProcessMapper.map(item.exeName, { appName: item.appName });
    assert.equal(mapped.category, item.expectedCategory);
  }
});

runTest("display name overrides propagate into compiled app stats", () => {
  ProcessMapper.clearUserOverrides();
  ProcessMapper.setUserOverride("vscodium.exe", {
    displayName: "CodeLab",
    enabled: true,
    updatedAt: Date.now(),
  });

  const compiled = compileSessions([
    makeSession({
      id: 1,
      exe_name: "vscodium.exe",
      app_name: "VSCodium",
      start_time: 0,
      end_time: 60_000,
      duration: 60_000,
    }),
  ], {
    startMs: 0,
    endMs: 120_000,
    minSessionSecs: 0,
  });
  const stats = buildNormalizedAppStats(compiled);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].app_name, "CodeLab");
  ProcessMapper.clearUserOverrides();
});

runTest("dashboard read model applies display name overrides globally", () => {
  ProcessMapper.clearUserOverrides();
  ProcessMapper.setUserOverride("vscodium.exe", {
    displayName: "CodeLab",
    enabled: true,
    updatedAt: Date.now(),
  });

  const trackerHealth = resolveTrackerHealth(120_000, 120_000, 8_000);
  const dashboard = HistoryReadModelService.buildDashboardReadModel([
    makeSession({
      id: 1,
      exe_name: "vscodium.exe",
      app_name: "VSCodium",
      start_time: 0,
      end_time: 60_000,
      duration: 60_000,
    }),
  ], trackerHealth, 120_000);

  assert.equal(dashboard.topApplications.length, 1);
  assert.equal(dashboard.topApplications[0].name, "CodeLab");
  ProcessMapper.clearUserOverrides();
});

runTest("history read model applies display name overrides globally", () => {
  ProcessMapper.clearUserOverrides();
  ProcessMapper.setUserOverride("vscodium.exe", {
    displayName: "CodeLab",
    enabled: true,
    updatedAt: Date.now(),
  });

  const trackerHealth = resolveTrackerHealth(120_000, 120_000, 8_000);
  const historyView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({
        id: 1,
        exe_name: "vscodium.exe",
        app_name: "VSCodium",
        start_time: 0,
        end_time: 60_000,
        duration: 60_000,
      }),
    ],
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 120_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });

  assert.equal(historyView.appSummary.length, 1);
  assert.equal(historyView.appSummary[0].appName, "CodeLab");
  assert.equal(historyView.timelineSessions.length, 1);
  assert.equal(historyView.timelineSessions[0].displayName, "CodeLab");
  ProcessMapper.clearUserOverrides();
});

runTest("history read model excludes apps marked as not tracked", () => {
  ProcessMapper.clearUserOverrides();
  ProcessMapper.setUserOverride("qq.exe", {
    track: false,
    enabled: true,
    updatedAt: Date.now(),
  });

  const trackerHealth = resolveTrackerHealth(120_000, 120_000, 8_000);
  const historyView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({
        id: 1,
        exe_name: "QQ.exe",
        app_name: "QQ",
        start_time: 0,
        end_time: 60_000,
        duration: 60_000,
      }),
      makeSession({
        id: 2,
        exe_name: "chrome.exe",
        app_name: "Google Chrome",
        start_time: 65_000,
        end_time: 125_000,
        duration: 60_000,
      }),
    ],
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 120_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });

  assert.equal(historyView.appSummary.length, 1);
  assert.equal(historyView.appSummary[0].exeName.toLowerCase(), "chrome.exe");
  assert.equal(historyView.timelineSessions.length, 1);
  assert.equal(historyView.timelineSessions[0].exe_name.toLowerCase(), "chrome.exe");
  ProcessMapper.clearUserOverrides();
});

runTest("process mapper color output stays stable for same app key", () => {
  ProcessMapper.clearUserOverrides();
  const first = ProcessMapper.map("vscodium.exe", { appName: "VSCodium" });
  const second = ProcessMapper.map("vscodium.exe", { appName: "VSCodium" });
  assert.equal(first.color, second.color);
});

runTest("canonical normalization resolves aliases and filters PickerHost", () => {
  assert.equal(resolveCanonicalExecutable("Douyin_tray.exe"), "douyin.exe");
  assert.equal(resolveCanonicalExecutable("Douyin_widget"), "douyin.exe");
  assert.equal(resolveCanonicalExecutable("steamwebhelper.exe"), "steam.exe");
  assert.equal(resolveCanonicalExecutable("alma-0.0.750-win-x64.exe"), "alma.exe");
  assert.equal(resolveCanonicalExecutable("cursor-updater.exe"), "cursor.exe");
  assert.equal(resolveCanonicalExecutable("setup-notion.exe"), "notion.exe");
  assert.equal(resolveCanonicalExecutable("obsidian-uninstall.exe"), "obsidian.exe");
  assert.equal(resolveCanonicalDisplayName("douyin.exe"), "抖音");
  assert.equal(shouldTrackProcess("PickerHost.exe"), false);
  assert.equal(shouldTrackProcess("pickerhost"), false);
  assert.equal(shouldTrackProcess("uninstall.exe"), false);
  assert.equal(shouldTrackProcess("unins000.exe"), false);
  assert.equal(shouldTrackProcess("obsidian-setup.exe"), false);
  assert.equal(shouldTrackProcess("cursor-installer.exe"), false);
  assert.equal(shouldTrackProcess("cursor-updater.exe"), false);
  assert.equal(shouldTrackProcess("maintenancetool.exe"), false);
  assert.equal(shouldTrackProcess("alma-0.0.750-win-x64.exe", {
    appName: "AI Provider Management Desktop App",
    windowTitle: "Alma \u5b89\u88c5",
  }), false);
  assert.equal(shouldTrackProcess("alma-0.0.750-win-x64.exe", {
    appName: "AI Provider Management Desktop App",
    windowTitle: "Alma",
  }), true);
  assert.equal(shouldTrackProcess("Antigravity.exe"), true);
});

runTest("compiler removes PickerHost from read model", () => {
  const compiled = compileSessions([
    makeSession({ id: 1, exe_name: "PickerHost.exe", app_name: "PickerHost", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "QQ.exe", app_name: "QQ", start_time: 60_000, end_time: 120_000, duration: 60_000 }),
  ], {
    startMs: 0,
    endMs: 200_000,
    minSessionSecs: 0,
  });

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].exe_name, "QQ.exe");
});

runTest("dashboard read model caps live session growth at the last successful sample when tracker is stale", () => {
  const trackerHealth = resolveTrackerHealth(10_000, 19_000, 8_000);
  const dashboard = HistoryReadModelService.buildDashboardReadModel([
    makeSession({
      id: 1,
      exe_name: "QQ.exe",
      start_time: 1_000,
      end_time: null,
      duration: null,
    }),
  ], trackerHealth, 19_000);

  assert.equal(dashboard.totalTrackedTime, 9_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 1);
  assert.equal(dashboard.diagnostics.suspiciousDuration, 9_000);
  assert.equal(dashboard.topApplications[0].suspiciousDuration, 9_000);
});

runTest("history app summary stays on real active duration even when timeline merges interruptions for display", () => {
  const trackerHealth = resolveTrackerHealth(200_000, 200_000, 8_000);
  const view = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 60_000, end_time: 90_000, duration: 30_000 }),
      makeSession({ id: 3, exe_name: "QQ.exe", start_time: 90_000, end_time: 150_000, duration: 60_000 }),
    ],
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 200_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });

  assert.equal(view.timelineSessions.length, 1);
  assert.equal(view.timelineSessions[0].duration, 120_000);
  assert.equal(view.timelineSessions[0].end_time, 150_000);
  const qqSummary = view.appSummary.find((item) => item.exeName === "QQ.exe");

  assert.ok(qqSummary);
  assert.equal(qqSummary.duration, 120_000);
});

runTest("history timeline merge threshold only changes timeline grouping and keeps app summary duration stable", () => {
  const trackerHealth = resolveTrackerHealth(200_000, 200_000, 8_000);
  const sessions = [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 60_000, end_time: 90_000, duration: 30_000 }),
    makeSession({ id: 3, exe_name: "QQ.exe", start_time: 90_000, end_time: 150_000, duration: 60_000 }),
  ];

  const mergedView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 200_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const splitView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 200_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 10,
  });

  assert.equal(mergedView.timelineSessions.length, 1);
  assert.equal(splitView.timelineSessions.length, 3);
  assert.equal(
    mergedView.appSummary.reduce((sum, item) => sum + item.duration, 0),
    splitView.appSummary.reduce((sum, item) => sum + item.duration, 0),
  );
});

runTest("min session threshold only affects timeline display, not real duration stats", () => {
  const trackerHealth = resolveTrackerHealth(100_000, 100_000, 8_000);
  const view = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 20_000, duration: 20_000 }),
      makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 25_000, end_time: 45_000, duration: 20_000 }),
    ],
    weeklySessions: [
      makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 20_000, duration: 20_000 }),
      makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 25_000, end_time: 45_000, duration: 20_000 }),
    ],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 100_000,
    minSessionSecs: 30,
    mergeThresholdSecs: 180,
  });

  assert.equal(view.timelineSessions.length, 0);
  assert.equal(view.appSummary.reduce((sum, item) => sum + item.duration, 0), 40_000);
  assert.equal(view.weekly.reduce((sum, item) => sum + item.total_duration, 0), 40_000);
});

runTest("history timeline keeps latest live session visible below min threshold and hides it once ended", () => {
  const trackerHealth = resolveTrackerHealth(200_000, 200_000, 8_000);

  const liveView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({
        id: 1,
        exe_name: "vscodium.exe",
        app_name: "VSCodium",
        start_time: 195_000,
        end_time: null,
        duration: null,
      }),
    ],
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 200_000,
    minSessionSecs: 180,
    mergeThresholdSecs: 180,
  });

  assert.equal(liveView.timelineSessions.length, 1);
  assert.equal(liveView.timelineSessions[0].duration, 5_000);

  const endedView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: [
      makeSession({
        id: 1,
        exe_name: "vscodium.exe",
        app_name: "VSCodium",
        start_time: 195_000,
        end_time: 197_000,
        duration: 2_000,
      }),
    ],
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 200_000,
    minSessionSecs: 180,
    mergeThresholdSecs: 180,
  });

  assert.equal(endedView.timelineSessions.length, 0);
});

runTest("history timeline merged duration does not change with min session threshold", () => {
  const trackerHealth = resolveTrackerHealth(100_000, 100_000, 8_000);
  const sessions = [
    makeSession({
      id: 1,
      exe_name: "vscodium.exe",
      app_name: "VSCodium",
      start_time: 0,
      end_time: 20_000,
      duration: 20_000,
    }),
    makeSession({
      id: 2,
      exe_name: "vscodium.exe",
      app_name: "VSCodium",
      start_time: 22_000,
      end_time: 42_000,
      duration: 20_000,
      window_title: "Code",
    }),
  ];

  const baseView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 100_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });

  const thresholdView = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: [],
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 100_000,
    minSessionSecs: 30,
    mergeThresholdSecs: 180,
  });

  assert.equal(baseView.timelineSessions.length, 1);
  assert.equal(thresholdView.timelineSessions.length, 1);
  assert.equal(baseView.timelineSessions[0].duration, 40_000);
  assert.equal(thresholdView.timelineSessions[0].duration, 40_000);
  assert.equal(baseView.timelineSessions[0].end_time, 42_000);
  assert.equal(thresholdView.timelineSessions[0].end_time, 42_000);
});

console.log(`Passed ${passed} tracking lifecycle tests`);
