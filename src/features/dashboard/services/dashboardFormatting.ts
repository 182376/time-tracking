import type { AppStat } from "../../../shared/types/app.ts";
import type { HistorySession } from "../../../shared/lib/sessionReadRepository.ts";
import type { AppCategory } from "../../../shared/classification/categoryTokens.ts";
import { AppClassification } from "../../../shared/classification/appClassification.ts";

export interface HourlyActivityPoint {
  hour: string;
  minutes: number;
}

export interface CategoryDistItem {
  category: AppCategory;
  name: string;
  value: number;
  color: string;
}

export interface TopApplicationItem {
  exeName: string;
  name: string;
  color: string;
  duration: number;
  suspiciousDuration: number;
  percentage: number;
  categoryInitial: string;
}

export function formatDashboardDuration(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getTotalTrackedTime(stats: AppStat[]) {
  return stats.reduce((total, item) => total + Math.max(0, item.totalDuration), 0);
}

export function buildTopApplications(stats: AppStat[]): TopApplicationItem[] {
  const totalTrackedTime = getTotalTrackedTime(stats);

  return stats.map((item) => {
    const mapped = AppClassification.mapApp(item.exeName, { appName: item.appName });
    const overrideName = AppClassification.getUserOverride(item.exeName)?.displayName?.trim();
    const name = overrideName || item.appName.trim() || mapped.name;
    return {
      exeName: item.exeName,
      name,
      color: mapped.color,
      duration: Math.max(0, item.totalDuration),
      suspiciousDuration: Math.max(0, item.suspiciousDuration),
      percentage: totalTrackedTime > 0
        ? Math.round((Math.max(0, item.totalDuration) / totalTrackedTime) * 100)
        : 0,
      categoryInitial: mapped.category[0].toUpperCase(),
    };
  });
}

export function buildHourlyActivity(sessions: HistorySession[]): HourlyActivityPoint[] {
  const hoursCount = new Array(24).fill(0);

  for (const session of sessions) {
    const start = new Date(session.startTime);
    const end = session.endTime ? new Date(session.endTime) : new Date();

    let hourPtr = start.getHours();
    let currentPtr = start.getTime();

    while (currentPtr < end.getTime()) {
      const nextHour = new Date(currentPtr);
      nextHour.setHours(hourPtr + 1, 0, 0, 0);

      const segmentEnd = Math.min(end.getTime(), nextHour.getTime());
      const durationMs = segmentEnd - currentPtr;

      hoursCount[hourPtr] += durationMs / 60000;

      currentPtr = segmentEnd;
      hourPtr = (hourPtr + 1) % 24;
    }
  }

  return hoursCount.map((minutes, h) => ({
    hour: `${h.toString().padStart(2, "0")}:00`,
    minutes: Math.round(minutes),
  }));
}

export function buildCategoryDistribution(stats: AppStat[]): CategoryDistItem[] {
  const categories = new Map<AppCategory, number>();

  for (const stat of stats) {
    const mapped = AppClassification.mapApp(stat.exeName, { appName: stat.appName });
    categories.set(mapped.category, (categories.get(mapped.category) ?? 0) + Math.max(0, stat.totalDuration));
  }

  return Array.from(categories.entries())
    .map(([cat, val]) => ({
      category: cat,
      name: AppClassification.getCategoryLabel(cat),
      value: val,
      color: AppClassification.getCategoryColor(cat),
    }))
    .sort((a, b) => b.value - a.value);
}
