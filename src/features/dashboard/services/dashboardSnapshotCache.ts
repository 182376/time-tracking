import { loadDashboardSnapshot, type DashboardSnapshot } from "./dashboardReadModel.ts";

const DASHBOARD_SNAPSHOT_CACHE = new Map<string, DashboardSnapshot>();

function formatDashboardSnapshotCacheKey(date: Date): string {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
}

export function getDashboardSnapshotCache(date: Date = new Date()): DashboardSnapshot | null {
  return DASHBOARD_SNAPSHOT_CACHE.get(formatDashboardSnapshotCacheKey(date)) ?? null;
}

export function setDashboardSnapshotCache(snapshot: DashboardSnapshot, date: Date = new Date()): void {
  DASHBOARD_SNAPSHOT_CACHE.set(formatDashboardSnapshotCacheKey(date), snapshot);
}

export async function prewarmDashboardSnapshotCache(date: Date = new Date()): Promise<DashboardSnapshot> {
  const snapshot = await loadDashboardSnapshot(date);
  setDashboardSnapshotCache(snapshot, date);
  return snapshot;
}
