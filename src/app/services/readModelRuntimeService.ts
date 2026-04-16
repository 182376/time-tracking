import { loadDashboardSnapshot, type DashboardSnapshot } from "../../features/dashboard/services/dashboardReadModel.ts";
import { loadHistorySnapshot, type HistorySnapshot } from "../../features/history/services/historyReadModel.ts";
import { ensureProcessMapperRuntimeReady } from "./processMapperRuntimeGate.ts";
import { setDashboardSnapshotCache } from "../../features/dashboard/services/dashboardSnapshotCache";
import { setHistorySnapshotCache } from "../../features/history/services/historySnapshotCache";

export async function loadDashboardRuntimeSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
  await ensureProcessMapperRuntimeReady();
  const snapshot = await loadDashboardSnapshot(date);
  setDashboardSnapshotCache(snapshot, date);
  return snapshot;
}

export async function loadHistoryRuntimeSnapshot(
  date: Date,
  rollingDayCount: number = 7,
): Promise<HistorySnapshot> {
  await ensureProcessMapperRuntimeReady();
  const snapshot = await loadHistorySnapshot(date, rollingDayCount);
  setHistorySnapshotCache(snapshot, date, rollingDayCount);
  return snapshot;
}
