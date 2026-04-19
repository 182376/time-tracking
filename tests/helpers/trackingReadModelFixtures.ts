import { buildDashboardReadModel } from "../../src/features/dashboard/services/dashboardReadModel.ts";
import { buildHistoryReadModel } from "../../src/features/history/services/historyReadModel.ts";
import { resolveTrackerHealth } from "../../src/shared/types/tracking.ts";
import type { HistorySession } from "../../src/shared/lib/sessionReadRepository.ts";
import { makeSession } from "./trackingTestHarness.ts";

export function makeHealthyTrackerHealth(nowMs: number = 200_000, lastHeartbeatMs: number = nowMs) {
  return resolveTrackerHealth(lastHeartbeatMs, nowMs, 8_000);
}

export function makeStaleTrackerHealth(lastHeartbeatMs: number = 15_000, checkedAtMs: number = 30_000) {
  return resolveTrackerHealth(lastHeartbeatMs, checkedAtMs, 8_000);
}

export function makeInterruptedSameAppSessions(): HistorySession[] {
  return [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 60_000, end_time: 90_000, duration: 30_000 }),
    makeSession({ id: 3, exe_name: "QQ.exe", start_time: 90_000, end_time: 150_000, duration: 60_000 }),
  ];
}

export function makeShortTimelineSessions(): HistorySession[] {
  return [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 20_000, duration: 20_000 }),
    makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 25_000, end_time: 45_000, duration: 20_000 }),
  ];
}

export function buildHistoryView(params: {
  daySessions: HistorySession[];
  weeklySessions?: HistorySession[];
  trackerHealth?: ReturnType<typeof resolveTrackerHealth>;
  selectedDate?: Date;
  nowMs?: number;
  minSessionSecs?: number;
  mergeThresholdSecs?: number;
}) {
  const {
    daySessions,
    weeklySessions = [],
    trackerHealth = makeHealthyTrackerHealth(),
    selectedDate = new Date(0),
    nowMs = 200_000,
    minSessionSecs = 0,
    mergeThresholdSecs = 180,
  } = params;

  return buildHistoryReadModel({
    daySessions,
    weeklySessions,
    selectedDate,
    trackerHealth,
    nowMs,
    minSessionSecs,
    mergeThresholdSecs,
  });
}

export function buildDashboardView(
  sessions: HistorySession[],
  trackerHealth: ReturnType<typeof resolveTrackerHealth> = makeHealthyTrackerHealth(),
  nowMs: number = 200_000,
) {
  return buildDashboardReadModel(sessions, trackerHealth, nowMs);
}
