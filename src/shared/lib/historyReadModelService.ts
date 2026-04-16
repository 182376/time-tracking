import {
  buildDashboardReadModel,
  loadDashboardSnapshot,
  loadIconSnapshot,
} from "../../features/dashboard/services/dashboardReadModel.ts";
import {
  buildHistoryReadModel,
  loadHistorySnapshot,
} from "../../features/history/services/historyReadModel.ts";

export {
  buildDashboardReadModel,
  loadDashboardSnapshot,
  loadIconSnapshot,
} from "../../features/dashboard/services/dashboardReadModel.ts";
export {
  buildHistoryReadModel,
  loadHistorySnapshot,
} from "../../features/history/services/historyReadModel.ts";
export type {
  DashboardReadModel,
  DashboardSnapshot,
  IconSnapshot,
} from "../../features/dashboard/services/dashboardReadModel.ts";
export type {
  HistoryReadModel,
  HistorySnapshot,
} from "../../features/history/services/historyReadModel.ts";

// Keep the legacy service-shaped export so tests and any remaining compatibility
// callers can migrate incrementally without reintroducing cross-feature logic here.
export const HistoryReadModelService = {
  buildDashboardReadModel,
  loadDashboardSnapshot,
  loadIconSnapshot,
  buildHistoryReadModel,
  loadHistorySnapshot,
};
