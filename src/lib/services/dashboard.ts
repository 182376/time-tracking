import { AppStat } from "../../types/app";
import { ProcessMapper } from "../ProcessMapper";

export interface FocusShareItem {
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
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getTotalTrackedTime(stats: AppStat[]) {
  return stats.reduce((total, item) => total + item.total_duration, 0);
}

export function buildFocusShare(stats: AppStat[]): FocusShareItem[] {
  return stats.slice(0, 5).map((item) => {
    const mapped = ProcessMapper.map(item.exe_name);
    return {
      name: mapped.name,
      value: item.total_duration,
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
      duration: item.total_duration,
      percentage: totalTrackedTime > 0
        ? Math.round((item.total_duration / totalTrackedTime) * 100)
        : 0,
      categoryInitial: mapped.category[0].toUpperCase(),
    };
  });
}
