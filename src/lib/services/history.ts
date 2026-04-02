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
  const normalized = sessions
    .filter(s => s.exe_name.toLowerCase() !== "time_tracker.exe")
    .map((session) => ({
    ...session,
    duration: session.duration ?? 0,
    end_time: session.end_time ?? session.start_time + (session.duration ?? 0),
    window_title: cleanWindowTitle(session.window_title, session.exe_name),
    mergedCount: 1,
    displayName: ProcessMapper.map(session.exe_name).name,
    displayTitle: "",
  })).sort((a, b) => a.start_time - b.start_time);

  return normalized.reduce<TimelineSession[]>((acc, session) => {
    const previous = acc[acc.length - 1];
    if (!previous) {
      acc.push({ ...session });
      return acc;
    }

    const previousEnd = previous.end_time || previous.start_time;
    // Check if they map to the exact same App Name (even if exe is distinct, e.g. code.exe vs Code.exe)
    const sameApp = previous.displayName === session.displayName;
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
  const totals = new Map<string, { exe_name: string; total_duration: number }>();

  for (const s of normalized) {
    const dur = s.duration || 0;
    const appName = s.displayName;

    const existing = totals.get(appName);
    if (existing) {
      existing.total_duration += dur;
    } else {
      totals.set(appName, {
        exe_name: s.exe_name, // fallback for fetching icon
        total_duration: dur
      });
    }
  }

  return Array.from(totals.entries())
    .map(([app_name, info]) => ({
      app_name,
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

const MACRO_INTERRUPTION_MS = 60_000; // 60 seconds of max interruption
const AFK_GAP_MS = 5 * 60 * 1000; // 5 minutes of physical AFK gap truncates macro merges

export function mergeSessionsForTimeline(sessions: HistorySession[]): TimelineSession[] {
  const normalized = normalizeVisibleSessions(sessions);
  if (normalized.length === 0) return [];
  
  const result: TimelineSession[] = [];
  let i = 0;
  
  while (i < normalized.length) {
    const current = { ...normalized[i] };
    let j = i + 1;
    
    // Look ahead to find the next occurrence of `current`
    while (j < normalized.length) {
      const nextCandidate = normalized[j];
      const prevSession = normalized[j - 1];
      
      // If there's a physical gap indicative of AFK (> 5 mins), break macro logic
      const gapToNext = nextCandidate.start_time - prevSession.end_time!;
      if (gapToNext > AFK_GAP_MS) {
        break; 
      }
      
      if (nextCandidate.displayName === current.displayName) {
        const interruptionDuration = nextCandidate.start_time - current.end_time!;
        
        if (interruptionDuration <= MACRO_INTERRUPTION_MS) {
          // Absorb!
          current.end_time = Math.max(current.end_time!, nextCandidate.end_time!);
          current.duration = current.end_time - current.start_time;
          current.mergedCount += nextCandidate.mergedCount;
          
          i = j;
          j++;
          continue;
        } else {
          break; // The disruption is too long to bridge
        }
      } else {
        const interruptionSoFar = nextCandidate.end_time! - current.end_time!;
        if (interruptionSoFar > MACRO_INTERRUPTION_MS) {
          break; // The sequence of unlike apps has lasted too long, bridging is impossible
        }
      }
      j++;
    }
    
    result.push(current);
    i++;
  }

  // Final cleanup: Remove untidy < 30s artifacts that weren't absorbed into a macro session
  return result
    .filter(s => (s.duration || 0) >= 30_000)
    .map(s => {
      return {
        ...s,
        displayTitle: s.window_title,
      };
    });
}
