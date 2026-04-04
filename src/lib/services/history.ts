import type { DailySummary } from "../db";

export interface HistoryChartPoint {
  day: string;
  hours: number;
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
    hours: Math.round((Math.max(0, item.total_duration) / 3600000) * 10) / 10,
  }));
}

export function formatChartHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

export function buildChartAxis(points: HistoryChartPoint[]) {
  const maxHours = Math.max(0, ...points.map((point) => point.hours));
  const roughStep = maxHours > 0 ? maxHours / 4 : 1;
  const niceSteps = [0.5, 1, 2, 4, 6, 8, 12, 24];
  const step = niceSteps.find((candidate) => candidate >= roughStep) ?? Math.ceil(roughStep);
  const domainMax = step * 4;

  return {
    domainMax,
    ticks: Array.from({ length: 5 }, (_, index) => index * step),
  };
}
