import type { AppStat } from "../../../shared/types/app.ts";
import type { TrackerHealthSnapshot } from "../../../shared/types/tracking.ts";
import {
  getHistoryByDate,
  getIconMap,
  type HistorySession,
} from "../../../platform/persistence/sessionReadRepository.ts";
import {
  buildCategoryDistribution,
  buildHourlyActivity,
  buildTopApplications,
  getTotalTrackedTime,
  type CategoryDistItem,
  type HourlyActivityPoint,
  type TopApplicationItem,
} from "./dashboardFormatting.ts";
import {
  buildNormalizedAppStats,
  getDayRange,
  type CompiledSession,
} from "../../../shared/lib/sessionReadCompiler.ts";
import {
  buildReadModelDiagnostics,
  compileForRange,
  materializeLiveSessions,
  resolveLiveCutoffMs,
  type ReadModelDiagnostics,
} from "../../../shared/lib/readModelCore.ts";

export interface DashboardSnapshot {
  fetchedAtMs: number;
  icons: Record<string, string>;
  sessions: HistorySession[];
}

export interface IconSnapshot {
  fetchedAtMs: number;
  icons: Record<string, string>;
}

export interface DashboardReadModel {
  compiledSessions: CompiledSession[];
  stats: AppStat[];
  totalTrackedTime: number;
  topApplications: TopApplicationItem[];
  hourlyActivity: HourlyActivityPoint[];
  categoryDist: CategoryDistItem[];
  diagnostics: ReadModelDiagnostics;
}

export async function loadDashboardSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
  const [sessions, icons] = await Promise.all([
    getHistoryByDate(date),
    getIconMap(),
  ]);

  return {
    fetchedAtMs: Date.now(),
    icons,
    sessions,
  };
}

export async function loadIconSnapshot(): Promise<IconSnapshot> {
  const icons = await getIconMap();

  return {
    fetchedAtMs: Date.now(),
    icons,
  };
}

export function buildDashboardReadModel(
  sessions: HistorySession[],
  trackerHealth: TrackerHealthSnapshot,
  nowMs: number,
): DashboardReadModel {
  const dayRange = getDayRange(new Date(nowMs), nowMs);
  const liveSessions = materializeLiveSessions(sessions, trackerHealth, nowMs);
  const compiledSessions = compileForRange(liveSessions, dayRange, 0);
  const stats = buildNormalizedAppStats(compiledSessions);
  const diagnostics = buildReadModelDiagnostics(
    compiledSessions,
    trackerHealth,
    resolveLiveCutoffMs(trackerHealth, nowMs),
  );

  return {
    compiledSessions,
    stats,
    totalTrackedTime: getTotalTrackedTime(stats),
    topApplications: buildTopApplications(stats),
    hourlyActivity: buildHourlyActivity(compiledSessions),
    categoryDist: buildCategoryDistribution(stats),
    diagnostics,
  };
}
