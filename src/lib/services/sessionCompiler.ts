import type { AppStat } from "../../types/app";
import type { DailySummary, HistorySession } from "../db";
import { ProcessMapper } from "../ProcessMapper.ts";
import { cleanWindowTitle } from "./TitleCleaner.ts";

const DIRECT_MERGE_GAP_MS = 5_000;

export interface SessionRange {
  startMs: number;
  endMs: number;
}

export interface CompileSessionsOptions extends SessionRange {
  minSessionSecs: number;
}

export interface CompiledSession extends HistorySession {
  appKey: string;
  mergedCount: number;
  displayName: string;
  displayTitle: string;
  titleSamples: string[];
}

export interface TimelineSession extends CompiledSession {}

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

function prepareSession(
  session: HistorySession,
): CompiledSession {
  const rawEndTime = Math.max(session.start_time, getSessionRawEndTime(session));
  const displayName = ProcessMapper.map(session.exe_name).name;
  const cleanedTitle = cleanWindowTitle(session.window_title, session.exe_name);
  const normalizedTitle = normalizeTitle(cleanedTitle, displayName);

  return {
    ...session,
    end_time: rawEndTime,
    duration: rawEndTime - session.start_time,
    appKey: session.exe_name.toLowerCase(),
    mergedCount: 1,
    displayName,
    displayTitle: normalizedTitle,
    titleSamples: normalizedTitle ? [normalizedTitle] : [],
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
  sessions: HistorySession[],
  options: CompileSessionsOptions,
): CompiledSession[] {
  const prepared = sessions
    .filter((session) => session.exe_name.toLowerCase() !== "time_tracker.exe")
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

    if (sameApp && gap >= 0 && gap <= DIRECT_MERGE_GAP_MS) {
      previous.end_time = Math.max(previousEnd, session.end_time ?? session.start_time);
      previous.duration = (previous.end_time ?? previousEnd) - previous.start_time;
      previous.mergedCount += session.mergedCount;
      previous.titleSamples = mergeTitleSamples(previous.titleSamples, session.titleSamples);
      return acc;
    }

    acc.push({ ...session });
    return acc;
  }, []);

  const minDurationMs = Math.max(0, options.minSessionSecs) * 1000;

  return merged
    .filter((session) => (session.duration ?? 0) >= minDurationMs)
    .map((session) => clipCompiledSession(session, options.startMs, options.endMs))
    .filter((session): session is CompiledSession => Boolean(session))
    .map(finalizeCompiledSession);
}

export function buildNormalizedAppStats(sessions: CompiledSession[]): AppStat[] {
  const totals = new Map<string, { app_name: string; exe_name: string; total_duration: number }>();

  for (const session of sessions) {
    const duration = Math.max(0, session.duration ?? 0);
    const existing = totals.get(session.appKey);

    if (existing) {
      existing.total_duration += duration;
      continue;
    }

    totals.set(session.appKey, {
      app_name: session.displayName,
      exe_name: session.exe_name,
      total_duration: duration,
    });
  }

  return Array.from(totals.values()).sort((a, b) => b.total_duration - a.total_duration);
}

export function buildAppSummary(
  stats: AppStat[],
): Array<{ exeName: string; duration: number; percentage: number }> {
  const totalDayDuration = stats.reduce((sum, item) => sum + item.total_duration, 0);

  return stats.map((item) => ({
    exeName: item.exe_name,
    duration: item.total_duration,
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
        const interruptionDuration = nextCandidate.start_time - currentEnd;

        if (interruptionDuration <= mergeThresholdMs) {
          current.end_time = Math.max(currentEnd, nextCandidate.end_time ?? nextCandidate.start_time);
          current.duration = Math.max(0, current.duration ?? 0) + Math.max(0, nextCandidate.duration ?? 0);
          current.mergedCount += nextCandidate.mergedCount;
          current.titleSamples = mergeTitleSamples(current.titleSamples, nextCandidate.titleSamples);
          current.displayTitle = summarizeTitleSamples(current.titleSamples);
          current.window_title = current.displayTitle;
          i = j;
          j += 1;
          continue;
        }

        break;
      }

      const currentEnd = current.end_time ?? current.start_time;
      const interruptionSoFar = (nextCandidate.end_time ?? nextCandidate.start_time) - currentEnd;
      if (interruptionSoFar > mergeThresholdMs) {
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
  return dayRanges.map((range) => {
    const compiled = compileSessions(sessions, {
      startMs: range.startMs,
      endMs: range.endMs,
      minSessionSecs,
    });

    return {
      date: formatDateKey(range.startMs),
      total_duration: compiled.reduce((sum, session) => sum + Math.max(0, session.duration ?? 0), 0),
    };
  });
}
