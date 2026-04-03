import { AppStat } from "../../types/app";
import { HistorySession } from "../db";
import { ProcessMapper } from "../ProcessMapper";

export interface FocusShareItem {
  name: string;
  value: number;
  color: string;
}

export interface HourlyActivityPoint {
  hour: string;
  minutes: number;
}

export interface CategoryDistItem {
  name: string;
  value: number;
  color: string;
}

export interface TopApplicationItem {
  exeName: string;
  name: string;
  color: string;
  duration: number;
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

export function buildFocusShare(stats: AppStat[]): FocusShareItem[] {
  return stats.slice(0, 5).map((item) => {
    const mapped = ProcessMapper.map(item.exe_name);
    return {
      name: mapped.name,
      value: Math.max(0, item.total_duration),
      color: mapped.color,
    };
  });
}

export function buildTopApplications(stats: AppStat[]): TopApplicationItem[] {
  const totalTrackedTime = getTotalTrackedTime(stats);

  return stats.map((item) => {
    const mapped = ProcessMapper.map(item.exe_name);
    return {
      exeName: item.exe_name,
      name: mapped.name,
      color: mapped.color,
      duration: Math.max(0, item.total_duration),
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
  const categories = new Map<string, number>();

  for (const stat of stats) {
    const mapped = ProcessMapper.map(stat.exe_name);
    categories.set(mapped.category, (categories.get(mapped.category) ?? 0) + Math.max(0, stat.total_duration));
  }

  const labels: Record<string, { label: string; color: string }> = {
    work: { label: "工作学习", color: "#6366F1" },
    social: { label: "社交通讯", color: "#10B981" },
    entertainment: { label: "娱乐放松", color: "#EC4899" },
    system: { label: "系统工具", color: "#F59E0B" },
    other: { label: "其他应用", color: "#94A3B8" },
  };

  return Array.from(categories.entries())
    .map(([cat, val]) => ({
      name: labels[cat]?.label ?? cat,
      value: val,
      color: labels[cat]?.color ?? "#CCC",
    }))
    .sort((a, b) => b.value - a.value);
}
