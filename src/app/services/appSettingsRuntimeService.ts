import {
  loadSettings,
  saveSetting,
  type AppSettings,
} from "../../shared/lib/settingsPersistenceAdapter";
import { setAfkTimeout } from "./trackingRuntimeGateway";

export class AppSettingsRuntimeService {
  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await setAfkTimeout(value as number);
    }
  }

  static async loadLatestSettings() {
    return loadSettings();
  }

  static async applyAfkTimeout(timeoutSecs: number) {
    await setAfkTimeout(timeoutSecs);
  }
}
