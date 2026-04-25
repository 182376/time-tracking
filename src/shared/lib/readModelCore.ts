import type { TrackerHealthSnapshot, TrackerHealthStatus } from "../types/tracking.ts";
import {
  compileSessions,
  type CompiledSession,
  type DiagnosableHistorySession,
} from "./sessionReadCompiler.ts";

export interface ReadModelDiagnostics {
  trackerStatus: TrackerHealthStatus;
  lastHeartbeatMs: number | null;
  liveCutoffMs: number;
  suspiciousSessionCount: number;
  suspiciousDuration: number;
  suspiciousAppCount: number;
  hasWarnings: boolean;
}

export function resolveLiveCutoffMs(trackerHealth: TrackerHealthSnapshot, nowMs: number): number {
  if (trackerHealth.status === "healthy") {
    return nowMs;
  }

  return trackerHealth.lastHeartbeatMs ?? 0;
}

export function materializeLiveSessions(
  sessions: DiagnosableHistorySession[],
  trackerHealth: TrackerHealthSnapshot,
  nowMs: number,
): DiagnosableHistorySession[] {
  const liveCutoffMs = resolveLiveCutoffMs(trackerHealth, nowMs);

  return sessions.map((session) => {
    if (session.endTime !== null) {
      return session;
    }

    return {
      ...session,
      duration: Math.max(0, liveCutoffMs - session.startTime),
      diagnosticCodes: trackerHealth.status === "stale" ? ["tracker_stale_live_session"] : [],
      suspiciousDuration: trackerHealth.status === "stale"
        ? Math.max(0, liveCutoffMs - session.startTime)
        : 0,
    };
  });
}

export function buildReadModelDiagnostics(
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

export function compileForRange(
  sessions: DiagnosableHistorySession[],
  range: { startMs: number; endMs: number },
  minSessionSecs: number,
  options: { keepLatestLiveSession?: boolean } = {},
): CompiledSession[] {
  return compileSessions(sessions, {
    startMs: range.startMs,
    endMs: range.endMs,
    minSessionSecs,
    keepLatestLiveSession: options.keepLatestLiveSession,
  });
}
