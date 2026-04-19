import type { AppStat } from "../types/app";
import type { DailySummary, HistorySession } from "./sessionReadRepository";
import { AppClassification } from "../classification/appClassification.ts";
import { cleanWindowTitle } from "./windowTitleCleaner.ts";

const DIRECT_MERGE_GAP_MS = 5_000;

export type SessionDiagnosticCode = "tracker_stale_live_session";

export interface DiagnosableHistorySession extends HistorySession {
  diagnosticCodes?: SessionDiagnosticCode[];
  suspiciousDuration?: number;
}

export interface SessionRange {
  startMs: number;
  endMs: number;
}

export interface CompileSessionsOptions extends SessionRange {
  minSessionSecs: number;
  keepLatestLiveSession?: boolean;
}

export interface CompiledSession extends HistorySession {
  // Stable grouping key for stats and timeline merges.
  appKey: string;
  continuity_group_start_time: number;
  mergedCount: number;
  // User-facing display name produced by normalization rules.
  displayName: string;
  displayTitle: string;
  titleSamples: string[];
  sourceIds: number[];
  diagnosticCodes: SessionDiagnosticCode[];
  suspiciousDuration: number;
  isLive: boolean;
}

export type TimelineSession = CompiledSession;

export interface NormalizedAppSummaryItem {
  exeName: string;
  appName: string;
  duration: number;
  suspiciousDuration: number;
  percentage: number;
}

function getSessionRawEndTime(session: HistorySession) {
  const duration = Math.max(0, session.duration ?? 0);
  return session.end_time ?? (session.start_time + duration);
}

function normalizeTitle(title: string, displayName: string) {
  const normalized = title.trim();
  if (!normalized) return "";
  return normalized.toLowerCase() === displayName.trim().toLowerCase() ? "" : normalized;
}

function mergeTitleSamples(current: string[], incoming: string[]) {
  return Array.from(new Set([...current, ...incoming].filter(Boolean))).slice(0, 6);
}

function summarizeTitleSamples(titleSamples: string[]) {
  if (titleSamples.length === 0) return "";
  if (titleSamples.length === 1) return titleSamples[0];
  return `${titleSamples[0]} +${titleSamples.length - 1}`;
}

function mergeDiagnosticCodes(
  current: SessionDiagnosticCode[],
  incoming: SessionDiagnosticCode[],
) {
  return Array.from(new Set([...current, ...incoming]));
}

function shouldTrackInReadModel(session: HistorySession) {
  const exeName = session.exe_name;
  const canonicalExe = AppClassification.resolveCanonicalExecutable(exeName);
  return AppClassification.shouldTrackProcess(exeName, {
    appName: session.app_name,
    windowTitle: session.window_title,
  }) && AppClassification.shouldTrackApp(canonicalExe);
}

function resolveCompiledDisplayName(
  session: DiagnosableHistorySession,
  appKey: string,
) {
  const overrideDisplayName = AppClassification.getUserOverride(appKey)?.displayName?.trim();
  if (overrideDisplayName) {
    return overrideDisplayName;
  }

  const canonicalName = AppClassification.resolveCanonicalDisplayName(appKey);
  if (canonicalName) {
    return canonicalName;
  }

  const rawExeKey = AppClassification.normalizeExecutable(session.exe_name);

  if (appKey !== rawExeKey) {
    // For alias executables (installer/updater/tray variants), prefer the
    // canonical app identity over raw product metadata from the alias process.
    return AppClassification.mapApp(appKey).name;
  }

  const mapped = AppClassification.mapApp(appKey, { appName: session.app_name });
  const appName = session.app_name.trim();
  if (appName) {
    return appName;
  }

  return mapped.name;
}

function resolveStatsExeName(session: CompiledSession) {
  const rawExeKey = AppClassification.normalizeExecutable(session.exe_name);
  // Keep original exe_name only when it already matches the canonical key.
  // Otherwise persist the canonical executable as the stats identity.
  return session.appKey === rawExeKey ? session.exe_name : session.appKey;
}

function containsCjkCharacters(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function scoreDisplayNameForStats(name: string) {
  const normalized = name.trim();
  if (!normalized) return 0;

  const lower = normalized.toLowerCase();
  if (lower.includes("tray") || lower.includes("widget")) return 1;
  if (containsCjkCharacters(normalized)) return 4;
  if (lower.includes("_") || lower.includes("-")) return 2;
  return 3;
}

function pickPreferredAppName(current: string, next: string) {
  const currentScore = scoreDisplayNameForStats(current);
  const nextScore = scoreDisplayNameForStats(next);
  return nextScore > currentScore ? next : current;
}

function prepareSession(
  session: DiagnosableHistorySession,
): CompiledSession {
  const rawEndTime = Math.max(session.start_time, getSessionRawEndTime(session));
  const appKey = AppClassification.resolveCanonicalExecutable(session.exe_name);
  const displayName = resolveCompiledDisplayName(session, appKey);
  const cleanedTitle = cleanWindowTitle(session.window_title, session.exe_name);
  const normalizedTitle = normalizeTitle(cleanedTitle, displayName);

  return {
    ...session,
    end_time: rawEndTime,
    duration: rawEndTime - session.start_time,
    continuity_group_start_time:
      session.continuity_group_start_time ?? session.start_time,
    appKey,
    mergedCount: 1,
    displayName,
    displayTitle: normalizedTitle,
    titleSamples: normalizedTitle ? [normalizedTitle] : [],
    sourceIds: [session.id],
    diagnosticCodes: [...(session.diagnosticCodes ?? [])],
    suspiciousDuration: Math.max(0, session.suspiciousDuration ?? 0),
    isLive: session.end_time === null,
  };
}

function clipCompiledSession(
  session: CompiledSession,
  rangeStartMs: number,
  rangeEndMs: number,
): CompiledSession | null {
  const clippedStart = Math.max(session.start_time, rangeStartMs);
  const clippedEnd = Math.min(session.end_time ?? session.start_time, rangeEndMs);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  return {
    ...session,
    start_time: clippedStart,
    end_time: clippedEnd,
    duration: clippedEnd - clippedStart,
    suspiciousDuration: Math.min(Math.max(0, session.suspiciousDuration), clippedEnd - clippedStart),
  };
}

function finalizeCompiledSession(session: CompiledSession): CompiledSession {
  const displayTitle = summarizeTitleSamples(session.titleSamples);

  return {
    ...session,
    window_title: displayTitle,
    displayTitle,
  };
}

function buildCompiledSessionBase(
  sessions: DiagnosableHistorySession[],
  minSessionSecs: number,
  keepLatestLiveSession: boolean = false,
): CompiledSession[] {
  const directMergeGapMs = minSessionSecs > 0 ? DIRECT_MERGE_GAP_MS : 0;
  const prepared = sessions
    .filter((session) => shouldTrackInReadModel(session))
    .map((session) => prepareSession(session))
    .sort((a, b) => a.start_time - b.start_time);

  const merged = prepared.reduce<CompiledSession[]>((acc, session) => {
    const previous = acc[acc.length - 1];
    if (!previous) {
      acc.push({ ...session });
      return acc;
    }

    const previousEnd = previous.end_time ?? previous.start_time;
    const gap = session.start_time - previousEnd;
    const sameApp = previous.appKey === session.appKey;

    if (sameApp && gap >= 0 && gap <= directMergeGapMs) {
      previous.end_time = Math.max(previousEnd, session.end_time ?? session.start_time);
      previous.duration = (previous.end_time ?? previousEnd) - previous.start_time;
      previous.continuity_group_start_time = Math.min(
        previous.continuity_group_start_time,
        session.continuity_group_start_time,
      );
      previous.mergedCount += session.mergedCount;
      previous.titleSamples = mergeTitleSamples(previous.titleSamples, session.titleSamples);
      previous.sourceIds = [...previous.sourceIds, ...session.sourceIds];
      previous.diagnosticCodes = mergeDiagnosticCodes(previous.diagnosticCodes, session.diagnosticCodes);
      previous.suspiciousDuration += session.suspiciousDuration;
      previous.isLive = previous.isLive || session.isLive;
      return acc;
    }

    acc.push({ ...session });
    return acc;
  }, []);

  const minDurationMs = Math.max(0, minSessionSecs) * 1000;
  const latestLiveSession = merged.reduce<CompiledSession | null>((latest, session) => {
    if (!session.isLive) {
      return latest;
    }

    if (!latest) {
      return session;
    }

    const latestEnd = latest.end_time ?? latest.start_time;
    const sessionEnd = session.end_time ?? session.start_time;
    return sessionEnd >= latestEnd ? session : latest;
  }, null);

  return merged
    .filter((session) => (
      (session.duration ?? 0) >= minDurationMs
      || (keepLatestLiveSession && latestLiveSession === session)
    ))
    .map(finalizeCompiledSession);
}

function getClippedDuration(
  session: CompiledSession,
  rangeStartMs: number,
  rangeEndMs: number,
) {
  const clippedStart = Math.max(session.start_time, rangeStartMs);
  const clippedEnd = Math.min(session.end_time ?? session.start_time, rangeEndMs);
  return Math.max(0, clippedEnd - clippedStart);
}

function formatDateKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getDayRange(date: Date, nowMs: number = Date.now()): SessionRange {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startMs: start.getTime(),
    endMs: Math.min(end.getTime(), nowMs),
  };
}

export function getRollingDayRanges(dayCount: number, nowMs: number = Date.now()): SessionRange[] {
  const ranges: SessionRange[] = [];
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    ranges.push(getDayRange(day, nowMs));
  }

  return ranges;
}

export function compileSessions(
  sessions: DiagnosableHistorySession[],
  options: CompileSessionsOptions,
): CompiledSession[] {
  return buildCompiledSessionBase(sessions, options.minSessionSecs, options.keepLatestLiveSession)
    .map((session) => clipCompiledSession(session, options.startMs, options.endMs))
    .filter((session): session is CompiledSession => Boolean(session));
}

export function buildNormalizedAppStats(sessions: CompiledSession[]): AppStat[] {
  const totals = new Map<string, {
    app_name: string;
    exe_name: string;
    total_duration: number;
    suspicious_duration: number;
  }>();

  for (const session of sessions) {
    const duration = Math.max(0, session.duration ?? 0);
    const suspiciousDuration = Math.max(0, session.suspiciousDuration);
    const existing = totals.get(session.appKey);

    if (existing) {
      existing.total_duration += duration;
      existing.suspicious_duration += suspiciousDuration;
      existing.app_name = pickPreferredAppName(existing.app_name, session.displayName);
      continue;
    }

    totals.set(session.appKey, {
      app_name: session.displayName,
      exe_name: resolveStatsExeName(session),
      total_duration: duration,
      suspicious_duration: suspiciousDuration,
    });
  }

  return Array.from(totals.values()).sort((a, b) => b.total_duration - a.total_duration);
}

export function buildAppSummary(
  stats: AppStat[],
): NormalizedAppSummaryItem[] {
  const totalDayDuration = stats.reduce((sum, item) => sum + item.total_duration, 0);

  return stats.map((item) => ({
    exeName: item.exe_name,
    appName: item.app_name,
    duration: item.total_duration,
    suspiciousDuration: item.suspicious_duration,
    percentage: totalDayDuration > 0 ? (item.total_duration / totalDayDuration) * 100 : 0,
  }));
}

export function buildTimelineSessions(
  sessions: CompiledSession[],
  mergeThresholdSecs: number = 180,
): TimelineSession[] {
  if (sessions.length === 0) return [];

  const mergeThresholdMs = Math.max(0, mergeThresholdSecs) * 1000;
  const result: TimelineSession[] = [];
  let i = 0;

  while (i < sessions.length) {
    const current: TimelineSession = {
      ...sessions[i],
      titleSamples: [...sessions[i].titleSamples],
    };
    let j = i + 1;

    while (j < sessions.length) {
      const nextCandidate = sessions[j];
      const prevSession = sessions[j - 1];
      const prevEnd = prevSession.end_time ?? prevSession.start_time;
      const gapToNext = nextCandidate.start_time - prevEnd;

      if (gapToNext > mergeThresholdMs) {
        break;
      }

      if (nextCandidate.appKey === current.appKey) {
        const currentEnd = current.end_time ?? current.start_time;
        const gapFromCurrent = nextCandidate.start_time - currentEnd;
        const sharesContinuityGroup =
          current.continuity_group_start_time ===
          nextCandidate.continuity_group_start_time;

        if (sharesContinuityGroup || gapFromCurrent <= mergeThresholdMs) {
          current.end_time = Math.max(currentEnd, nextCandidate.end_time ?? nextCandidate.start_time);
          current.duration = Math.max(0, current.duration ?? 0) + Math.max(0, nextCandidate.duration ?? 0);
          current.continuity_group_start_time = Math.min(
            current.continuity_group_start_time,
            nextCandidate.continuity_group_start_time,
          );
          current.mergedCount += nextCandidate.mergedCount;
          current.titleSamples = mergeTitleSamples(current.titleSamples, nextCandidate.titleSamples);
          current.sourceIds = [...current.sourceIds, ...nextCandidate.sourceIds];
          current.diagnosticCodes = mergeDiagnosticCodes(current.diagnosticCodes, nextCandidate.diagnosticCodes);
          current.suspiciousDuration += nextCandidate.suspiciousDuration;
          current.isLive = current.isLive || nextCandidate.isLive;
          current.displayTitle = summarizeTitleSamples(current.titleSamples);
          current.window_title = current.displayTitle;
          i = j;
          j += 1;
          continue;
        }

        break;
      }

      j += 1;
    }

    result.push(current);
    i += 1;
  }

  return result;
}

export function buildDailySummaries(
  sessions: HistorySession[],
  dayRanges: SessionRange[],
  minSessionSecs: number,
): DailySummary[] {
  const compiled = buildCompiledSessionBase(sessions, minSessionSecs, false);

  return dayRanges.map((range) => {
    return {
      date: formatDateKey(range.startMs),
      total_duration: compiled.reduce(
        (sum, session) => sum + getClippedDuration(session, range.startMs, range.endMs),
        0,
      ),
    };
  });
}
