import type { AppStat } from "../../types/app";
import type { DailySummary, HistorySession } from "../db";
import { ProcessMapper } from "../ProcessMapper.ts";
import { cleanWindowTitle } from "./TitleCleaner.ts";

const DIRECT_MERGE_GAP_MS = 5_000;
const MIN_VISIBLE_DURATION_MS = 30_000;

export interface HistoryChartPoint {
  day: string;
  minutes: number;
}

export interface HistoryAppSummaryItem {
  exeName: string;
  duration: number;
  percentage: number;
}

export interface TimelineSession extends HistorySession {
  appKey: string;
  mergedCount: number;
  displayName: string;
  displayTitle: string;
}

interface PreparedTimelineSession extends TimelineSession {
  titleSamples: string[];
}

export function formatDuration(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${minutes}m`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return "<1s";
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";

  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function buildChartData(weekly: DailySummary[]): HistoryChartPoint[] {
  return weekly.map((item) => ({
    day: item.date.slice(5),
    minutes: Math.round(Math.max(0, item.total_duration) / 60000),
  }));
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
  return `${titleSamples[0]} 等 ${titleSamples.length} 个窗口`;
}

function finalizePreparedSession(session: PreparedTimelineSession): TimelineSession {
  const displayTitle = summarizeTitleSamples(session.titleSamples);
  return {
    ...session,
    window_title: displayTitle,
    displayTitle,
  };
}

function prepareVisibleSessions(sessions: HistorySession[]): PreparedTimelineSession[] {
  const prepared = sessions
    .filter((session) => session.exe_name.toLowerCase() !== "time_tracker.exe")
    .map((session) => {
      const displayName = ProcessMapper.map(session.exe_name).name;
      const cleanedTitle = cleanWindowTitle(session.window_title, session.exe_name);
      const normalizedTitle = normalizeTitle(cleanedTitle, displayName);
      const duration = Math.max(0, session.duration ?? 0);
      const end_time = session.end_time ?? session.start_time + duration;
      const appKey = session.exe_name.toLowerCase();

      return {
        ...session,
        appKey,
        duration,
        end_time,
        window_title: normalizedTitle,
        mergedCount: 1,
        displayName,
        displayTitle: "",
        titleSamples: normalizedTitle ? [normalizedTitle] : [],
      };
    })
    .sort((a, b) => a.start_time - b.start_time);

  return prepared.reduce<PreparedTimelineSession[]>((acc, session) => {
    const previous = acc[acc.length - 1];
    if (!previous) {
      acc.push({ ...session });
      return acc;
    }

    const previousEnd = previous.end_time || previous.start_time;
    const sameApp = previous.appKey === session.appKey;
    const gap = session.start_time - previousEnd;

    if (sameApp && gap >= 0 && gap <= DIRECT_MERGE_GAP_MS) {
      previous.end_time = Math.max(previousEnd, session.end_time!);
      previous.duration = previous.end_time - previous.start_time;
      previous.mergedCount += session.mergedCount;
      previous.titleSamples = mergeTitleSamples(previous.titleSamples, session.titleSamples);
      return acc;
    }

    acc.push({ ...session });
    return acc;
  }, []);
}

export function normalizeVisibleSessions(sessions: HistorySession[]): TimelineSession[] {
  return prepareVisibleSessions(sessions).map(finalizePreparedSession);
}

export function buildNormalizedAppStats(sessions: HistorySession[]): AppStat[] {
  const normalized = normalizeVisibleSessions(sessions);
  const totals = new Map<string, { app_name: string; exe_name: string; total_duration: number }>();

  for (const session of normalized) {
    const duration = Math.max(0, session.duration || 0);
    const existing = totals.get(session.appKey);

    if (existing) {
      existing.total_duration += duration;
    } else {
      totals.set(session.appKey, {
        app_name: session.displayName,
        exe_name: session.exe_name,
        total_duration: duration,
      });
    }
  }

  return Array.from(totals.values())
    .map((info) => ({
      app_name: info.app_name,
      exe_name: info.exe_name,
      total_duration: info.total_duration,
    }))
    .sort((a, b) => b.total_duration - a.total_duration);
}

export function buildAppSummary(sessions: HistorySession[]): HistoryAppSummaryItem[] {
  const stats = buildNormalizedAppStats(sessions);
  const totalDayDuration = stats.reduce((sum, item) => sum + item.total_duration, 0);

  return stats.map((item) => ({
    exeName: item.exe_name,
    duration: item.total_duration,
    percentage: totalDayDuration > 0 ? (item.total_duration / totalDayDuration) * 100 : 0,
  }));
}

export function mergeSessionsForTimeline(
  sessions: HistorySession[],
  mergeThresholdSecs: number = 180,
): TimelineSession[] {
  const normalized = prepareVisibleSessions(sessions);
  if (normalized.length === 0) return [];
  const mergeThresholdMs = Math.max(0, mergeThresholdSecs) * 1000;

  const result: PreparedTimelineSession[] = [];
  let i = 0;

  while (i < normalized.length) {
    const current: PreparedTimelineSession = {
      ...normalized[i],
      titleSamples: [...normalized[i].titleSamples],
    };
    let j = i + 1;

    while (j < normalized.length) {
      const nextCandidate = normalized[j];
      const prevSession = normalized[j - 1];
      const gapToNext = nextCandidate.start_time - prevSession.end_time!;

      if (gapToNext > mergeThresholdMs) {
        break;
      }

      if (nextCandidate.appKey === current.appKey) {
        const interruptionDuration = nextCandidate.start_time - current.end_time!;

        if (interruptionDuration <= mergeThresholdMs) {
          current.end_time = Math.max(current.end_time!, nextCandidate.end_time!);
          current.duration = current.end_time - current.start_time;
          current.mergedCount += nextCandidate.mergedCount;
          current.titleSamples = mergeTitleSamples(current.titleSamples, nextCandidate.titleSamples);
          i = j;
          j++;
          continue;
        }

        break;
      }

      const interruptionSoFar = nextCandidate.end_time! - current.end_time!;
      if (interruptionSoFar > mergeThresholdMs) {
        break;
      }

      j++;
    }

    result.push(current);
    i++;
  }

  return result
    .filter((session) => (session.duration || 0) >= MIN_VISIBLE_DURATION_MS)
    .map(finalizePreparedSession);
}
