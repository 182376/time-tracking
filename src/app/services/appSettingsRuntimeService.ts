import type { AppSettings } from "../../lib/settings";
import { SettingsService } from "../../lib/services/SettingsService";
import { TrackingService } from "../../lib/services/TrackingService";

export class AppSettingsRuntimeService {
  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await SettingsService.updateSetting(key, value);
  }

  static async loadLatestSettings() {
    return SettingsService.load();
  }

  static async applyAfkTimeout(timeoutSecs: number) {
    await TrackingService.setAfkTimeout(timeoutSecs);
  }
}
