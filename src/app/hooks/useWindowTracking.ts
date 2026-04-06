import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS } from "../../lib/settings-store";
import type { AppSettings } from "../../lib/settings-store";
import type {
  TrackerHealthSnapshot,
  TrackingWindowSnapshot,
} from "../../types/tracking";
import { resolveTrackerHealth } from "../../types/tracking";
import {
  loadAppRuntimeBootstrapSnapshot,
  loadTrackerHealthSnapshot,
  TRACKER_HEARTBEAT_STALE_AFTER_MS,
} from "../services/appRuntimeBootstrapService";
import {
  onActiveWindowChanged,
  onTrackingDataChanged,
} from "../services/trackingRuntimeGateway";
import {
  setDesktopBehavior,
  setLaunchBehavior,
} from "../services/desktopBehaviorRuntimeAdapter";
import { AppSettingsRuntimeService } from "../services/appSettingsRuntimeService";

const TRACKER_HEARTBEAT_POLL_MS = 1_000;

export function useWindowTracking() {
  const [activeWindow, setActiveWindow] = useState<TrackingWindowSnapshot | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [syncTick, setSyncTick] = useState(0);
  const [trackerHealth, setTrackerHealth] = useState<TrackerHealthSnapshot>(() => (
    resolveTrackerHealth(null, Date.now(), TRACKER_HEARTBEAT_STALE_AFTER_MS)
  ));

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    let heartbeatTimer: number | null = null;

    const refreshTrackerHealth = async () => {
      const snapshot = await loadTrackerHealthSnapshot(Date.now());
      if (!cancelled) {
        setTrackerHealth(snapshot);
      }
    };

    const init = async () => {
      try {
        const bootstrap = await loadAppRuntimeBootstrapSnapshot();
        if (cancelled) return;

        setAppSettings(bootstrap.settings);
        setActiveWindow(bootstrap.activeWindow);
        setTrackerHealth(bootstrap.trackerHealth);
      } catch (err) {
        if (cancelled) return;
        console.error("Tracking init error", err);
      }

      if (cancelled) return;

      const activeWindowUnlisten = await onActiveWindowChanged((window) => {
        if (cancelled) return;
        setActiveWindow(window);
      });
      if (cancelled) {
        activeWindowUnlisten();
        return;
      }
      unlisteners.push(activeWindowUnlisten);

      const trackingDataUnlisten = await onTrackingDataChanged(
        (payload) => {
          if (cancelled) return;

          if (payload.reason === "tracking-paused" || payload.reason === "tracking-resumed") {
            void AppSettingsRuntimeService.loadLatestSettings()
              .then((latestSettings) => {
                if (cancelled) return;
                setAppSettings((current) => ({
                  ...current,
                  tracking_paused: latestSettings.tracking_paused,
                }));
              })
              .catch((error) => {
                if (!cancelled) {
                  console.warn("Failed to sync tracking pause setting", error);
                }
              });
          }

          setSyncTick((tick) => tick + 1);
        },
      );
      if (cancelled) {
        trackingDataUnlisten();
        return;
      }
      unlisteners.push(trackingDataUnlisten);

      heartbeatTimer = window.setInterval(() => {
        void refreshTrackerHealth();
      }, TRACKER_HEARTBEAT_POLL_MS);
    };

    void init();

    return () => {
      cancelled = true;
      for (const off of unlisteners) {
        off();
      }
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
      }
    };
  }, []);

  useEffect(() => {
    void setDesktopBehavior(
      appSettings.close_behavior,
      appSettings.minimize_behavior,
    ).catch(console.warn);
  }, [appSettings.close_behavior, appSettings.minimize_behavior]);

  useEffect(() => {
    void setLaunchBehavior(
      appSettings.launch_at_login,
      appSettings.start_minimized,
    ).catch(console.warn);
  }, [appSettings.launch_at_login, appSettings.start_minimized]);

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
    trackerHealth,
  };
}
