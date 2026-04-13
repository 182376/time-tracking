import {
  loadSettings,
  saveSetting,
  type AppSettings,
} from "../../shared/lib/settingsPersistenceAdapter";
import { setIdleTimeout } from "./trackingRuntimeGateway";

export class AppSettingsRuntimeService {
  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveSetting(key, value);

    if (key === "idle_timeout_secs") {
      await setIdleTimeout(value as number);
    }
  }

  static async loadLatestSettings() {
    return loadSettings();
  }

  static async applyIdleTimeout(timeoutSecs: number) {
    await setIdleTimeout(timeoutSecs);
  }
}
