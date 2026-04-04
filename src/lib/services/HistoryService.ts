import type { AppStat } from "../../types/app";
import type { TrackerHealthSnapshot, TrackerHealthStatus } from "../../types/tracking";
import { getHistoryByDate, getIconMap, getSessionsInRange, type DailySummary, type HistorySession } from "../db.ts";
import {
  buildCategoryDistribution,
  buildHourlyActivity,
  buildTopApplications,
  getTotalTrackedTime,
  type CategoryDistItem,
  type HourlyActivityPoint,
  type TopApplicationItem,
} from "./dashboard.ts";
import { buildChartAxis, buildChartData, type HistoryChartPoint } from "./history.ts";
import {
  buildAppSummary,
  buildDailySummaries,
  buildNormalizedAppStats,
  buildTimelineSessions,
  compileSessions,
  getDayRange,
  getRollingDayRanges,
  type CompiledSession,
  type DiagnosableHistorySession,
  type NormalizedAppSummaryItem,
  type TimelineSession,
} from "./sessionCompiler.ts";

export interface DashboardSnapshot {
  fetchedAtMs: number;
  icons: Record<string, string>;
  sessions: HistorySession[];
}

export interface HistorySnapshot {
  fetchedAtMs: number;
  daySessions: HistorySession[];
  weeklySessions: HistorySession[];
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

export interface HistoryReadModel {
  compiledSessions: CompiledSession[];
  timelineSessions: TimelineSession[];
  appSummary: NormalizedAppSummaryItem[];
  weekly: DailySummary[];
  chartData: HistoryChartPoint[];
  chartAxis: ReturnType<typeof buildChartAxis>;
  diagnostics: ReadModelDiagnostics;
}

export interface ReadModelDiagnostics {
  trackerStatus: TrackerHealthStatus;
  lastHeartbeatMs: number | null;
  liveCutoffMs: number;
  suspiciousSessionCount: number;
  suspiciousDuration: number;
  suspiciousAppCount: number;
  hasWarnings: boolean;
}

function resolveLiveCutoffMs(trackerHealth: TrackerHealthSnapshot, nowMs: number) {
  if (trackerHealth.status === "healthy") {
    return nowMs;
  }

  return trackerHealth.lastHeartbeatMs ?? 0;
}

function materializeLiveSessions(
  sessions: HistorySession[],
  trackerHealth: TrackerHealthSnapshot,
  nowMs: number,
): DiagnosableHistorySession[] {
  const liveCutoffMs = resolveLiveCutoffMs(trackerHealth, nowMs);

  return sessions.map((session) => {
    if (session.end_time !== null) {
      return session;
    }

    return {
      ...session,
      duration: Math.max(0, liveCutoffMs - session.start_time),
      diagnosticCodes: trackerHealth.status === "stale" ? ["tracker_stale_live_session"] : [],
      suspiciousDuration: trackerHealth.status === "stale"
        ? Math.max(0, liveCutoffMs - session.start_time)
        : 0,
    };
  });
}

function buildDiagnostics(
  compiledSessions: CompiledSession[],
  trackerHealth: TrackerHealthSnapshot,
  liveCutoffMs: number,
): ReadModelDiagnostics {
  const suspiciousSessionCount = compiledSessions.filter((session) => session.diagnosticCodes.length > 0).length;
  const suspiciousDuration = compiledSessions.reduce(
    (sum, session) => sum + Math.max(0, session.suspiciousDuration),
    0,
  );
  const suspiciousAppCount = new Set(
    compiledSessions
      .filter((session) => session.suspiciousDuration > 0)
      .map((session) => session.appKey),
  ).size;

  return {
    trackerStatus: trackerHealth.status,
    lastHeartbeatMs: trackerHealth.lastHeartbeatMs,
    liveCutoffMs,
    suspiciousSessionCount,
    suspiciousDuration,
    suspiciousAppCount,
    hasWarnings: trackerHealth.status === "stale" || suspiciousSessionCount > 0,
  };
}

function compileForRange(
  sessions: DiagnosableHistorySession[],
  range: ReturnType<typeof getDayRange>,
  minSessionSecs: number,
  options: { keepLatestLiveSession?: boolean } = {},
) {
  return compileSessions(sessions, {
    startMs: range.startMs,
    endMs: range.endMs,
    minSessionSecs,
    keepLatestLiveSession: options.keepLatestLiveSession,
  });
}

export class HistoryService {
  static async loadDashboardSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
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

  static async loadHistorySnapshot(date: Date, rollingDayCount: number = 7): Promise<HistorySnapshot> {
    const selectedDayRange = getDayRange(date);
    const rollingRanges = getRollingDayRanges(rollingDayCount);
    const weeklyRangeStart = rollingRanges[0]?.startMs ?? selectedDayRange.startMs;
    const weeklyRangeEnd = rollingRanges[rollingRanges.length - 1]?.endMs ?? selectedDayRange.endMs;

    const [daySessions, weeklySessions] = await Promise.all([
      getHistoryByDate(date),
      getSessionsInRange(weeklyRangeStart, weeklyRangeEnd),
    ]);

    return {
      fetchedAtMs: Date.now(),
      daySessions,
      weeklySessions,
    };
  }

  static async loadIconSnapshot(): Promise<IconSnapshot> {
    const icons = await getIconMap();

    return {
      fetchedAtMs: Date.now(),
      icons,
    };
  }

  static buildDashboardReadModel(
    sessions: HistorySession[],
    trackerHealth: TrackerHealthSnapshot,
    nowMs: number,
  ): DashboardReadModel {
    const dayRange = getDayRange(new Date(nowMs), nowMs);
    const liveSessions = materializeLiveSessions(sessions, trackerHealth, nowMs);
    const compiledSessions = compileForRange(liveSessions, dayRange, 0);
    const stats = buildNormalizedAppStats(compiledSessions);
    const diagnostics = buildDiagnostics(
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

  static buildHistoryReadModel(params: {
    daySessions: HistorySession[];
    weeklySessions: HistorySession[];
    trackerHealth: TrackerHealthSnapshot;
    selectedDate: Date;
    nowMs: number;
    minSessionSecs: number;
    mergeThresholdSecs: number;
  }): HistoryReadModel {
    const {
      daySessions,
      weeklySessions,
      trackerHealth,
      selectedDate,
      nowMs,
      minSessionSecs,
      mergeThresholdSecs,
    } = params;
    const selectedDayRange = getDayRange(selectedDate, nowMs);
    const rollingRanges = getRollingDayRanges(7, nowMs);
    const liveDaySessions = materializeLiveSessions(daySessions, trackerHealth, nowMs);
    const liveWeeklySessions = materializeLiveSessions(weeklySessions, trackerHealth, nowMs);
    const compiledSessions = compileForRange(liveDaySessions, selectedDayRange, 0);
    const timelineSourceSessions = compileForRange(
      liveDaySessions,
      selectedDayRange,
      minSessionSecs,
      { keepLatestLiveSession: true },
    );
    const timelineSessions = buildTimelineSessions(timelineSourceSessions, mergeThresholdSecs).slice().reverse();
    const appSummary = buildAppSummary(buildNormalizedAppStats(compiledSessions));
    const weekly = buildDailySummaries(
      liveWeeklySessions,
      rollingRanges,
      0,
    );
    const chartData = buildChartData(weekly);
    const diagnostics = buildDiagnostics(
      compiledSessions,
      trackerHealth,
      resolveLiveCutoffMs(trackerHealth, nowMs),
    );

    // Keep read-model shaping in memory only for now. The hot paths get lighter
    // without introducing persistent summary tables or premature caching.
    return {
      compiledSessions,
      timelineSessions,
      appSummary,
      weekly,
      chartData,
      chartAxis: buildChartAxis(chartData),
      diagnostics,
    };
  }
}
