import {
  loadSettings,
  saveSetting,
  type AppSettings,
} from "../../shared/lib/settingsPersistenceAdapter";
import { setIdleTimeout } from "../../platform/runtime/trackingRuntimeGateway";
import {
  setDesktopBehavior,
  setLaunchBehavior,
} from "../../platform/desktop/desktopBehaviorRuntimeGateway";

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

  static async applyDesktopBehavior(
    closeBehavior: AppSettings["close_behavior"],
    minimizeBehavior: AppSettings["minimize_behavior"],
  ) {
    await setDesktopBehavior(closeBehavior, minimizeBehavior);
  }

  static async applyLaunchBehavior(
    launchAtLogin: AppSettings["launch_at_login"],
    startMinimized: AppSettings["start_minimized"],
  ) {
    await setLaunchBehavior(launchAtLogin, startMinimized);
  }
}
