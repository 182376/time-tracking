import {
  HistoryReadModelService,
  type DashboardSnapshot,
  type HistorySnapshot,
} from "../../shared/lib/historyReadModelService.ts";
import { refreshProcessMapperRuntime } from "./processMapperRuntimeService.ts";
import {
  getDashboardSnapshotCache,
  setDashboardSnapshotCache,
} from "../../features/dashboard/services/dashboardSnapshotCache";
import {
  getHistorySnapshotCache,
  setHistorySnapshotCache,
} from "../../features/history/services/historySnapshotCache";

let processMapperRefreshPromise: Promise<void> | null = null;

async function ensureProcessMapperRuntime(): Promise<void> {
  if (!processMapperRefreshPromise) {
    processMapperRefreshPromise = refreshProcessMapperRuntime().finally(() => {
      processMapperRefreshPromise = null;
    });
  }

  await processMapperRefreshPromise;
}

export function getDashboardRuntimeSnapshotCache(date: Date = new Date()): DashboardSnapshot | null {
  return getDashboardSnapshotCache(date);
}

export function getHistoryRuntimeSnapshotCache(
  date: Date = new Date(),
  rollingDayCount: number = 7,
): HistorySnapshot | null {
  return getHistorySnapshotCache(date, rollingDayCount);
}

export async function loadDashboardRuntimeSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
  await ensureProcessMapperRuntime();
  const snapshot = await HistoryReadModelService.loadDashboardSnapshot(date);
  setDashboardSnapshotCache(snapshot, date);
  return snapshot;
}

export async function loadHistoryRuntimeSnapshot(
  date: Date,
  rollingDayCount: number = 7,
): Promise<HistorySnapshot> {
  await ensureProcessMapperRuntime();
  const snapshot = await HistoryReadModelService.loadHistorySnapshot(date, rollingDayCount);
  setHistorySnapshotCache(snapshot, date, rollingDayCount);
  return snapshot;
}
