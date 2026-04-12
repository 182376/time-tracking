import {
  HistoryReadModelService,
  type DashboardSnapshot,
  type HistorySnapshot,
} from "../../shared/lib/historyReadModelService.ts";
import { refreshProcessMapperRuntime } from "./processMapperRuntimeService.ts";

export async function loadDashboardRuntimeSnapshot(date: Date = new Date()): Promise<DashboardSnapshot> {
  await refreshProcessMapperRuntime();
  return HistoryReadModelService.loadDashboardSnapshot(date);
}

export async function loadHistoryRuntimeSnapshot(
  date: Date,
  rollingDayCount: number = 7,
): Promise<HistorySnapshot> {
  await refreshProcessMapperRuntime();
  return HistoryReadModelService.loadHistorySnapshot(date, rollingDayCount);
}
