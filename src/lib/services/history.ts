import { AppStat } from "../../types/app";
import { HistorySession, DailySummary } from "../db";
import { cleanWindowTitle } from "./TitleCleaner";
import { ProcessMapper } from "../ProcessMapper";

const DIRECT_MERGE_GAP_MS = 5_000;

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
  mergedCount: number;
  displayName: string;
  displayTitle: string;
}

/** Format MS into `Xh Ym` */
export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(ms / 60000);
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
    minutes: Math.round(item.total_duration / 60000),
  }));
}

/**
 * Normalizes a list of simple sessions to fix gaps, clean titles and group them continuously 
 * if they are identical adjacent sessions within 5s gap.
 */
export function normalizeVisibleSessions(sessions: HistorySession[]): TimelineSession[] {
  const normalized = sessions.map((session) => ({
    ...session,
    duration: session.duration ?? 0,
    end_time: session.end_time ?? session.start_time + (session.duration ?? 0),
    window_title: cleanWindowTitle(session.window_title, session.exe_name),
    mergedCount: 1,
    displayName: "",
    displayTitle: ""
  })).sort((a, b) => a.start_time - b.start_time);

  return normalized.reduce<TimelineSession[]>((acc, session) => {
    const previous = acc[acc.length - 1];
    if (!previous) {
      acc.push({ ...session });
      return acc;
    }

    const previousEnd = previous.end_time || previous.start_time;
    const sameApp = previous.exe_name === session.exe_name;
    const gap = session.start_time - previousEnd;

    // Direct merge if same app and less than 5 second gap (flickers)
    if (sameApp && gap >= 0 && gap <= DIRECT_MERGE_GAP_MS) {
      previous.end_time = Math.max(previousEnd, session.end_time!);
      previous.duration = previous.end_time - previous.start_time;
      previous.mergedCount += 1;
      
      // Attempt to summarize title
      const uniqueTitles = Array.from(new Set([previous.window_title, session.window_title].filter(Boolean)));
      if (uniqueTitles.length === 1) previous.window_title = uniqueTitles[0];
      else if (uniqueTitles.length > 1) previous.window_title = `${uniqueTitles[0]} 等 ${uniqueTitles.length} 个窗口`;
      
      return acc;
    }

    acc.push({ ...session });
    return acc;
  }, []);
}

export function buildNormalizedAppStats(sessions: HistorySession[]): AppStat[] {
  const normalized = normalizeVisibleSessions(sessions);
  const totals = new Map<string, number>();

  for (const s of normalized) {
    const dur = s.duration || 0;
    totals.set(s.exe_name, (totals.get(s.exe_name) ?? 0) + dur);
  }

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([exe_name, total_duration]) => ({
      app_name: ProcessMapper.map(exe_name).name,
      exe_name,
      total_duration,
    }));
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

export function mergeSessionsForTimeline(sessions: HistorySession[]): TimelineSession[] {
  const normalized = normalizeVisibleSessions(sessions);

  // Filter out tiny artifacts unless they are part of a larger context, 
  // currently we'll enforce 30 seconds minimum for timeline view stability
  return normalized
    .filter(s => (s.duration || 0) >= 30_000)
    .map(s => {
      const mapped = ProcessMapper.map(s.exe_name);
      return {
        ...s,
        displayName: mapped.name,
        displayTitle: s.window_title,
      };
    });
}
