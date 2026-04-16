import { useEffect } from "react";
import type { AppSettings } from "../../shared/settings/appSettings";
import { AppSettingsRuntimeService } from "../services/appSettingsRuntimeService";

export function useDesktopLaunchBehaviorSync(appSettings: AppSettings) {
  useEffect(() => {
    void AppSettingsRuntimeService.applyDesktopBehavior(
      appSettings.close_behavior,
      appSettings.minimize_behavior,
    ).catch(console.warn);
  }, [appSettings.close_behavior, appSettings.minimize_behavior]);

  useEffect(() => {
    void AppSettingsRuntimeService.applyLaunchBehavior(
      appSettings.launch_at_login,
      appSettings.start_minimized,
    ).catch(console.warn);
  }, [appSettings.launch_at_login, appSettings.start_minimized]);
}
