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
      appSettings.closeBehavior,
      appSettings.minimizeBehavior,
    ).catch(console.warn);
  }, [appSettings.closeBehavior, appSettings.minimizeBehavior, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void setLaunchBehavior(
      appSettings.launchAtLogin,
      appSettings.startMinimized,
    ).catch(console.warn);
  }, [appSettings.launchAtLogin, appSettings.startMinimized, enabled]);
}
