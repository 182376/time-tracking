import assert from "node:assert/strict";
import { HistoryReadModelService } from "../src/shared/lib/historyReadModelService.ts";
import { buildTopApplications } from "../src/features/dashboard/services/dashboardFormatting.ts";
import { ProcessMapper } from "../src/features/classification/services/ProcessMapper.ts";
import { resolveTrackerHealth } from "../src/shared/types/tracking.ts";
import {
  shouldDeleteSessionByStartTime,
} from "../src/features/settings/services/sessionCleanupPolicy.ts";
import {
  createTestHarness,
  makeSession,
} from "./helpers/trackingTestHarness.ts";

const harness = createTestHarness();
const runTest = harness.run;

const trackerHealth = resolveTrackerHealth(400_000, 400_000, 8_000);

runTest("history replay filters pickerhost and keeps alias aggregation stable", () => {
  const daySessions = [
    makeSession({
      id: 1,
      app_name: "Google Chrome",
      exe_name: "chrome.exe",
      start_time: 0,
      end_time: 60_000,
      duration: 60_000,
    }),
    makeSession({
      id: 2,
      app_name: "Douyin_tray",
      exe_name: "Douyin_tray.exe",
      start_time: 65_000,
      end_time: 125_000,
      duration: 60_000,
    }),
    makeSession({
      id: 3,
      app_name: "抖音",
      exe_name: "douyin.exe",
      start_time: 130_000,
      end_time: 190_000,
      duration: 60_000,
    }),
    makeSession({
      id: 4,
      app_name: "QQ",
      exe_name: "QQ.exe",
      start_time: 200_000,
      end_time: 260_000,
      duration: 60_000,
    }),
    makeSession({
      id: 5,
      app_name: "PickerHost",
      exe_name: "PickerHost.exe",
      start_time: 270_000,
      end_time: 330_000,
      duration: 60_000,
    }),
  ];

  const readModel = HistoryReadModelService.buildHistoryReadModel({
    daySessions,
    weeklySessions: daySessions,
    selectedDate: new Date(0),
    trackerHealth,
    nowMs: 400_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });

  assert.equal(
    readModel.appSummary.some((item) => item.exeName.toLowerCase().includes("pickerhost")),
    false,
  );
  assert.equal(
    readModel.appSummary.filter((item) => item.exeName.toLowerCase() === "douyin.exe").length,
    1,
  );
  assert.equal(
    readModel.appSummary.find((item) => item.exeName.toLowerCase() === "douyin.exe")?.duration,
    120_000,
  );
});

runTest("dashboard replay keeps alias aggregation stable and filters pickerhost", () => {
  const sessions = [
    makeSession({
      id: 1,
      app_name: "Google Chrome",
      exe_name: "chrome.exe",
      start_time: 0,
      end_time: 60_000,
      duration: 60_000,
    }),
    makeSession({
      id: 2,
      app_name: "Douyin_tray",
      exe_name: "Douyin_tray.exe",
      start_time: 65_000,
      end_time: 125_000,
      duration: 60_000,
    }),
    makeSession({
      id: 3,
      app_name: "抖音",
      exe_name: "douyin.exe",
      start_time: 130_000,
      end_time: 190_000,
      duration: 60_000,
    }),
    makeSession({
      id: 4,
      app_name: "QQ",
      exe_name: "QQ.exe",
      start_time: 200_000,
      end_time: 260_000,
      duration: 60_000,
    }),
    makeSession({
      id: 5,
      app_name: "PickerHost",
      exe_name: "PickerHost.exe",
      start_time: 270_000,
      end_time: 330_000,
      duration: 60_000,
    }),
  ];

  const dashboard = HistoryReadModelService.buildDashboardReadModel(sessions, trackerHealth, 400_000);
  assert.equal(
    dashboard.topApplications.some((item) => item.exeName.toLowerCase().includes("pickerhost")),
    false,
  );
  assert.equal(
    dashboard.topApplications.filter((item) => item.exeName.toLowerCase() === "douyin.exe").length,
    1,
  );
  assert.equal(
    dashboard.topApplications.some((item) => item.exeName.toLowerCase() === "qq.exe"),
    true,
  );
});

runTest("replay keeps stale live session growth capped in history and dashboard", () => {
  const staleTrackerHealth = resolveTrackerHealth(18_000, 30_000, 8_000);
  const sessions = [
    makeSession({
      id: 1,
      app_name: "Cursor",
      exe_name: "cursor.exe",
      start_time: 10_000,
      end_time: null,
      duration: null,
      window_title: "Refactor",
    }),
  ];

  const history = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = HistoryReadModelService.buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    30_000,
  );

  assert.equal(history.timelineSessions[0]?.duration, 8_000);
  assert.equal(history.diagnostics.trackerStatus, "stale");
  assert.equal(dashboard.compiledSessions[0]?.duration, 8_000);
  assert.equal(dashboard.diagnostics.trackerStatus, "stale");
});

runTest("replay keeps startup-sealed sessions closed under stale tracker", () => {
  const staleTrackerHealth = resolveTrackerHealth(18_000, 30_000, 8_000);
  const sessions = [
    makeSession({
      id: 1,
      app_name: "Cursor",
      exe_name: "cursor.exe",
      start_time: 10_000,
      end_time: 18_000,
      duration: 8_000,
      window_title: "Recovered",
    }),
  ];

  const history = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = HistoryReadModelService.buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    30_000,
  );

  assert.equal(history.timelineSessions[0]?.duration, 8_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 0);
  assert.equal(dashboard.compiledSessions[0]?.duration, 8_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
});

runTest("replay keeps startup-sealed sessions stable after cleanup on stale tracker", () => {
  const staleTrackerHealth = resolveTrackerHealth(18_000, 30_000, 8_000);
  const cutoffTime = 20_000;
  const allSessions = [
    makeSession({
      id: 1,
      app_name: "Old Active",
      exe_name: "old-active.exe",
      start_time: 10_000,
      end_time: null,
      duration: null,
      window_title: "Old Active",
    }),
    makeSession({
      id: 2,
      app_name: "Cursor",
      exe_name: "cursor.exe",
      start_time: 21_000,
      end_time: 24_000,
      duration: 3_000,
      window_title: "Recovered",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.start_time, cutoffTime)
  ));

  const history = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = HistoryReadModelService.buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    30_000,
  );

  assert.equal(history.timelineSessions.length, 1);
  assert.equal(history.timelineSessions[0]?.duration, 3_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 0);
  assert.equal(dashboard.compiledSessions.length, 1);
  assert.equal(dashboard.compiledSessions[0]?.duration, 3_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
});

runTest("replay keeps sessions starting at cleanup cutoff in stale tracker views", () => {
  const staleTrackerHealth = resolveTrackerHealth(26_000, 35_000, 8_000);
  const cutoffTime = 20_000;
  const allSessions = [
    makeSession({
      id: 1,
      app_name: "Before Cutoff",
      exe_name: "before-cutoff.exe",
      start_time: 19_999,
      end_time: 22_000,
      duration: 2_001,
      window_title: "Before Cutoff",
    }),
    makeSession({
      id: 2,
      app_name: "At Cutoff",
      exe_name: "at-cutoff.exe",
      start_time: cutoffTime,
      end_time: 24_000,
      duration: 4_000,
      window_title: "At Cutoff",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.start_time, cutoffTime)
  ));

  const history = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 35_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = HistoryReadModelService.buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    35_000,
  );

  assert.equal(history.timelineSessions.length, 1);
  assert.equal(history.timelineSessions[0]?.exe_name, "at-cutoff.exe");
  assert.equal(history.timelineSessions[0]?.duration, 4_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 0);
  assert.equal(dashboard.compiledSessions.length, 1);
  assert.equal(dashboard.compiledSessions[0]?.exe_name, "at-cutoff.exe");
  assert.equal(dashboard.compiledSessions[0]?.duration, 4_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
});

runTest("replay keeps active sessions starting at cleanup cutoff and caps them from stale heartbeat", () => {
  const staleTrackerHealth = resolveTrackerHealth(26_000, 35_000, 8_000);
  const cutoffTime = 20_000;
  const allSessions = [
    makeSession({
      id: 1,
      app_name: "Old Active",
      exe_name: "old-active.exe",
      start_time: 10_000,
      end_time: null,
      duration: null,
      window_title: "Old Active",
    }),
    makeSession({
      id: 2,
      app_name: "Boundary Active",
      exe_name: "boundary-active.exe",
      start_time: cutoffTime,
      end_time: null,
      duration: null,
      window_title: "Boundary Active",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.start_time, cutoffTime)
  ));

  const history = HistoryReadModelService.buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 35_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = HistoryReadModelService.buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    35_000,
  );

  assert.equal(history.timelineSessions.length, 1);
  assert.equal(history.timelineSessions[0]?.exe_name, "boundary-active.exe");
  assert.equal(history.timelineSessions[0]?.duration, 6_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 1);
  assert.equal(dashboard.compiledSessions.length, 1);
  assert.equal(dashboard.compiledSessions[0]?.exe_name, "boundary-active.exe");
  assert.equal(dashboard.compiledSessions[0]?.duration, 6_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 1);
});

runTest("dashboard formatting replay honors display name overrides", () => {
  ProcessMapper.setUserOverrides({
    "dism++x64.exe": {
      displayName: "Dism++",
      enabled: true,
    },
  });

  try {
    const overriddenTopApps = buildTopApplications([{
      app_name: "Dism++主程序",
      exe_name: "Dism++x64.exe",
      total_duration: 60_000,
      suspicious_duration: 0,
    }]);
    assert.equal(overriddenTopApps[0]?.name, "Dism++");
  } finally {
    ProcessMapper.clearUserOverrides();
  }
});

await harness.finish("tracking replay");
