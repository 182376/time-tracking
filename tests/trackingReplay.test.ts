import assert from "node:assert/strict";
import { buildDashboardReadModel } from "../src/features/dashboard/services/dashboardReadModel.ts";
import { buildHistoryReadModel } from "../src/features/history/services/historyReadModel.ts";
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
      appName: "Google Chrome",
      exeName: "chrome.exe",
      startTime: 0,
      endTime: 60_000,
      duration: 60_000,
    }),
    makeSession({
      id: 2,
      appName: "Douyin_tray",
      exeName: "Douyin_tray.exe",
      startTime: 65_000,
      endTime: 125_000,
      duration: 60_000,
    }),
    makeSession({
      id: 3,
      appName: "抖音",
      exeName: "douyin.exe",
      startTime: 130_000,
      endTime: 190_000,
      duration: 60_000,
    }),
    makeSession({
      id: 4,
      appName: "QQ",
      exeName: "QQ.exe",
      startTime: 200_000,
      endTime: 260_000,
      duration: 60_000,
    }),
    makeSession({
      id: 5,
      appName: "PickerHost",
      exeName: "PickerHost.exe",
      startTime: 270_000,
      endTime: 330_000,
      duration: 60_000,
    }),
  ];

  const readModel = buildHistoryReadModel({
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
      appName: "Google Chrome",
      exeName: "chrome.exe",
      startTime: 0,
      endTime: 60_000,
      duration: 60_000,
    }),
    makeSession({
      id: 2,
      appName: "Douyin_tray",
      exeName: "Douyin_tray.exe",
      startTime: 65_000,
      endTime: 125_000,
      duration: 60_000,
    }),
    makeSession({
      id: 3,
      appName: "抖音",
      exeName: "douyin.exe",
      startTime: 130_000,
      endTime: 190_000,
      duration: 60_000,
    }),
    makeSession({
      id: 4,
      appName: "QQ",
      exeName: "QQ.exe",
      startTime: 200_000,
      endTime: 260_000,
      duration: 60_000,
    }),
    makeSession({
      id: 5,
      appName: "PickerHost",
      exeName: "PickerHost.exe",
      startTime: 270_000,
      endTime: 330_000,
      duration: 60_000,
    }),
  ];

  const dashboard = buildDashboardReadModel(sessions, trackerHealth, 400_000);
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
      appName: "Cursor",
      exeName: "cursor.exe",
      startTime: 10_000,
      endTime: null,
      duration: null,
      windowTitle: "Refactor",
    }),
  ];

  const history = buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = buildDashboardReadModel(
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
      appName: "Cursor",
      exeName: "cursor.exe",
      startTime: 10_000,
      endTime: 18_000,
      duration: 8_000,
      windowTitle: "Recovered",
    }),
  ];

  const history = buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = buildDashboardReadModel(
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
      appName: "Old Active",
      exeName: "old-active.exe",
      startTime: 10_000,
      endTime: null,
      duration: null,
      windowTitle: "Old Active",
    }),
    makeSession({
      id: 2,
      appName: "Cursor",
      exeName: "cursor.exe",
      startTime: 21_000,
      endTime: 24_000,
      duration: 3_000,
      windowTitle: "Recovered",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.startTime, cutoffTime)
  ));

  const history = buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 30_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = buildDashboardReadModel(
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
      appName: "Before Cutoff",
      exeName: "before-cutoff.exe",
      startTime: 19_999,
      endTime: 22_000,
      duration: 2_001,
      windowTitle: "Before Cutoff",
    }),
    makeSession({
      id: 2,
      appName: "At Cutoff",
      exeName: "at-cutoff.exe",
      startTime: cutoffTime,
      endTime: 24_000,
      duration: 4_000,
      windowTitle: "At Cutoff",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.startTime, cutoffTime)
  ));

  const history = buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 35_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    35_000,
  );

  assert.equal(history.timelineSessions.length, 1);
  assert.equal(history.timelineSessions[0]?.exeName, "at-cutoff.exe");
  assert.equal(history.timelineSessions[0]?.duration, 4_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 0);
  assert.equal(dashboard.compiledSessions.length, 1);
  assert.equal(dashboard.compiledSessions[0]?.exeName, "at-cutoff.exe");
  assert.equal(dashboard.compiledSessions[0]?.duration, 4_000);
  assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
});

runTest("replay keeps active sessions starting at cleanup cutoff and caps them from stale heartbeat", () => {
  const staleTrackerHealth = resolveTrackerHealth(26_000, 35_000, 8_000);
  const cutoffTime = 20_000;
  const allSessions = [
    makeSession({
      id: 1,
      appName: "Old Active",
      exeName: "old-active.exe",
      startTime: 10_000,
      endTime: null,
      duration: null,
      windowTitle: "Old Active",
    }),
    makeSession({
      id: 2,
      appName: "Boundary Active",
      exeName: "boundary-active.exe",
      startTime: cutoffTime,
      endTime: null,
      duration: null,
      windowTitle: "Boundary Active",
    }),
  ];
  const sessions = allSessions.filter((session) => (
    !shouldDeleteSessionByStartTime(session.startTime, cutoffTime)
  ));

  const history = buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate: new Date(0),
    trackerHealth: staleTrackerHealth,
    nowMs: 35_000,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
  const dashboard = buildDashboardReadModel(
    sessions,
    staleTrackerHealth,
    35_000,
  );

  assert.equal(history.timelineSessions.length, 1);
  assert.equal(history.timelineSessions[0]?.exeName, "boundary-active.exe");
  assert.equal(history.timelineSessions[0]?.duration, 6_000);
  assert.equal(history.diagnostics.suspiciousSessionCount, 1);
  assert.equal(dashboard.compiledSessions.length, 1);
  assert.equal(dashboard.compiledSessions[0]?.exeName, "boundary-active.exe");
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
      appName: "Dism++主程序",
      exeName: "Dism++x64.exe",
      totalDuration: 60_000,
      suspiciousDuration: 0,
    }]);
    assert.equal(overriddenTopApps[0]?.name, "Dism++");
  } finally {
    ProcessMapper.clearUserOverrides();
  }
});

await harness.finish("tracking replay");
