import {
  clearAllAppOverrides,
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

  static async updateSetting(key: keyof AppSettings, value: number) {
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await TrackingService.setAfkTimeout(value);
    }
  }

  static async clearSessionsBefore(cutoffTime: number) {
    await clearSessionsBefore(cutoffTime);
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
}
