import { loadDashboardSnapshot, type DashboardSnapshot } from "../../features/dashboard/services/dashboardReadModel.ts";
import { loadHistorySnapshot, type HistorySnapshot } from "../../features/history/services/historyReadModel.ts";
import { ensureProcessMapperRuntimeReady } from "./processMapperRuntimeGate.ts";
import { setDashboardSnapshotCache } from "../../features/dashboard/services/dashboardSnapshotCache.ts";
import { setHistorySnapshotCache } from "../../features/history/services/historySnapshotCache.ts";

type DashboardRuntimeSnapshotDeps = {
  ensureProcessMapperRuntimeReady: () => Promise<void>;
  loadDashboardSnapshot: (date?: Date) => Promise<DashboardSnapshot>;
  setDashboardSnapshotCache: (snapshot: DashboardSnapshot, date?: Date) => void;
};

type HistoryRuntimeSnapshotDeps = {
  ensureProcessMapperRuntimeReady: () => Promise<void>;
  loadHistorySnapshot: (date: Date, rollingDayCount?: number) => Promise<HistorySnapshot>;
  setHistorySnapshotCache: (
    snapshot: HistorySnapshot,
    date?: Date,
    rollingDayCount?: number,
  ) => void;
};

const dashboardRuntimeSnapshotDeps: DashboardRuntimeSnapshotDeps = {
  ensureProcessMapperRuntimeReady,
  loadDashboardSnapshot,
  setDashboardSnapshotCache,
};

const historyRuntimeSnapshotDeps: HistoryRuntimeSnapshotDeps = {
  ensureProcessMapperRuntimeReady,
  loadHistorySnapshot,
  setHistorySnapshotCache,
};

export async function loadDashboardRuntimeSnapshotWithDeps(
  date: Date = new Date(),
  deps: DashboardRuntimeSnapshotDeps,
): Promise<DashboardSnapshot> {
  await deps.ensureProcessMapperRuntimeReady();
  const snapshot = await deps.loadDashboardSnapshot(date);
  deps.setDashboardSnapshotCache(snapshot, date);
  return snapshot;
}

export async function loadDashboardRuntimeSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
  return loadDashboardRuntimeSnapshotWithDeps(date, dashboardRuntimeSnapshotDeps);
}

export async function loadHistoryRuntimeSnapshotWithDeps(
  date: Date,
  rollingDayCount: number = 7,
  deps: HistoryRuntimeSnapshotDeps,
): Promise<HistorySnapshot> {
  await deps.ensureProcessMapperRuntimeReady();
  const snapshot = await deps.loadHistorySnapshot(date, rollingDayCount);
  deps.setHistorySnapshotCache(snapshot, date, rollingDayCount);
  return snapshot;
}

export async function loadHistoryRuntimeSnapshot(
  date: Date,
  rollingDayCount: number = 7,
): Promise<HistorySnapshot> {
  return loadHistoryRuntimeSnapshotWithDeps(date, rollingDayCount, historyRuntimeSnapshotDeps);
}
