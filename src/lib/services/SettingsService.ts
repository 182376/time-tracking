import { invoke } from "@tauri-apps/api/core";
import {
  clearAllAppOverrides,
  clearAllWindowTitles,
  clearSessionsBefore,
  deleteObservedAppSessions,
  loadAppOverrides,
  loadObservedAppCandidates,
  loadOtherCategoryCandidates,
  loadTrackerHealthTimestamp,
  loadSettings,
  saveAppOverride,
  saveSetting,
  type AppSettings,
  type ObservedAppCandidate,
  type OtherCategoryCandidate,
} from "../settings";
import type { AppOverride } from "../ProcessMapper.ts";
import { TrackingService } from "./TrackingService";

export class SettingsService {
  static async load() {
    return loadSettings();
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await TrackingService.setAfkTimeout(value as number);
    }
  }

  static async clearSessionsBefore(cutoffTime: number) {
    await clearSessionsBefore(cutoffTime);
  }

  static async clearAllWindowTitles() {
    await clearAllWindowTitles();
  }

  static async loadTrackerHealthTimestamp() {
    return loadTrackerHealthTimestamp();
  }

  static async loadAppOverrides() {
    return loadAppOverrides();
  }

  static async saveAppOverride(exeName: string, override: AppOverride | null) {
    await saveAppOverride(exeName, override);
  }

  static async clearAllAppOverrides() {
    await clearAllAppOverrides();
  }

  static async loadOtherCategoryCandidates(days: number = 30, limit: number = 30): Promise<OtherCategoryCandidate[]> {
    return loadOtherCategoryCandidates(days, limit);
  }

  static async loadObservedAppCandidates(days: number = 30, limit: number = 120): Promise<ObservedAppCandidate[]> {
    return loadObservedAppCandidates(days, limit);
  }

  static async deleteObservedAppSessions(exeName: string, scope: "today" | "all" = "all") {
    return deleteObservedAppSessions(exeName, scope);
  }

  static async exportBackup(path?: string): Promise<string> {
    return invoke<string>("cmd_export_backup", { backupPath: path ?? null });
  }

  static async restoreBackup(path: string): Promise<void> {
    await invoke("cmd_restore_backup", { backupPath: path });
  }
}
