import { loadDashboardRuntimeSnapshot, loadHistoryRuntimeSnapshot } from "./readModelRuntimeService";
import {
  prewarmSettingsBootstrapCache,
} from "../../features/settings/services/settingsRuntimeAdapterService";
import {
  prewarmClassificationBootstrapCache,
} from "../../features/classification/services/classificationService";

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
    loadDashboardRuntimeSnapshot(date),
    loadHistoryRuntimeSnapshot(date),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("Failed to prewarm startup snapshot cache:", result.reason);
    }
  }
}
