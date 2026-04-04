import type { AppStat } from "../../types/app";
import type { HistorySession } from "../db.ts";
import { getCategoryToken, type AppCategory } from "../config/categoryTokens.ts";
import { ProcessMapper } from "../ProcessMapper.ts";

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
  return stats.reduce((total, item) => total + Math.max(0, item.total_duration), 0);
}

export function buildTopApplications(stats: AppStat[]): TopApplicationItem[] {
  const totalTrackedTime = getTotalTrackedTime(stats);

  return stats.map((item) => {
    const mapped = ProcessMapper.map(item.exe_name, { appName: item.app_name });
    const name = item.app_name.trim() || mapped.name;
    return {
      exeName: item.exe_name,
      name,
      color: mapped.color,
      duration: Math.max(0, item.total_duration),
      suspiciousDuration: Math.max(0, item.suspicious_duration),
      percentage: totalTrackedTime > 0
        ? Math.round((Math.max(0, item.total_duration) / totalTrackedTime) * 100)
        : 0,
      categoryInitial: mapped.category[0].toUpperCase(),
    };
  });
}

export function buildHourlyActivity(sessions: HistorySession[]): HourlyActivityPoint[] {
  const hoursCount = new Array(24).fill(0);

  for (const session of sessions) {
    const start = new Date(session.start_time);
    const end = session.end_time ? new Date(session.end_time) : new Date();

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
    const mapped = ProcessMapper.map(stat.exe_name, { appName: stat.app_name });
    categories.set(mapped.category, (categories.get(mapped.category) ?? 0) + Math.max(0, stat.total_duration));
  }

  return Array.from(categories.entries())
    .map(([cat, val]) => ({
      category: cat,
      name: getCategoryToken(cat).label,
      value: val,
      color: getCategoryToken(cat).color,
    }))
    .sort((a, b) => b.value - a.value);
}
