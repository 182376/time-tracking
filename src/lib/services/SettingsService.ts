import {
  clearSessionsBefore,
  loadTrackerHealthTimestamp,
  loadSettings,
  saveSetting,
  type AppSettings,
} from "../settings";
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
}
