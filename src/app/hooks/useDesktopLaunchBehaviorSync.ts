import { useEffect } from "react";
import type { AppSettings } from "../../shared/settings/appSettings";
import {
  setDesktopBehavior,
  setLaunchBehavior,
} from "../../platform/desktop/desktopBehaviorRuntimeGateway";

export function useDesktopLaunchBehaviorSync(appSettings: AppSettings, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    void setDesktopBehavior(
      appSettings.close_behavior,
      appSettings.minimize_behavior,
    ).catch(console.warn);
  }, [appSettings.close_behavior, appSettings.minimize_behavior, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void setLaunchBehavior(
      appSettings.launch_at_login,
      appSettings.start_minimized,
    ).catch(console.warn);
  }, [appSettings.launch_at_login, appSettings.start_minimized, enabled]);
}
