import {
  prewarmSettingsBootstrapCache,
} from "../../features/settings/services/settingsBootstrapService.ts";
import {
  prewarmClassificationBootstrapCache,
} from "../../features/classification/services/classificationService";
import {
  prewarmDashboardSnapshotCache,
} from "../../features/dashboard/services/dashboardSnapshotCache";
import {
  prewarmHistorySnapshotCache,
} from "../../features/history/services/historySnapshotCache";

export async function prewarmStartupBootstrapCaches(): Promise<void> {
  const results = await Promise.allSettled([
    prewarmSettingsBootstrapCache(),
    prewarmClassificationBootstrapCache(),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Failed to prewarm startup bootstrap cache:", result.reason);
    }
  }
}

export async function prewarmStartupSnapshotCaches(date: Date = new Date()): Promise<void> {
  const results = await Promise.allSettled([
    prewarmDashboardSnapshotCache(date),
    prewarmHistorySnapshotCache(date),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Failed to prewarm startup snapshot cache:", result.reason);
    }
  }
}
