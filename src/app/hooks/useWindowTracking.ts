import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type AppSettings } from "../../shared/settings/appSettings";
import type {
  TrackerHealthSnapshot,
  TrackingWindowSnapshot,
} from "../../shared/types/tracking";
import { resolveTrackerHealth } from "../../shared/types/tracking";
import {
  loadAppRuntimeBootstrapSnapshot,
  TRACKER_HEARTBEAT_STALE_AFTER_MS,
} from "../services/appRuntimeBootstrapService";
import {
  subscribeActiveWindowChanged,
  subscribeTrackingDataChanged,
} from "../services/appRuntimeTrackingService";
import {
  loadLatestTrackingPauseSetting,
  shouldSyncTrackingPause,
} from "../services/trackingPauseSettingsSyncService";
import { startTrackerHealthPolling } from "../services/trackerHealthPollingService";
import { useDesktopLaunchBehaviorSync } from "./useDesktopLaunchBehaviorSync";

export function useWindowTracking() {
  const [activeWindow, setActiveWindow] = useState<TrackingWindowSnapshot | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [syncTick, setSyncTick] = useState(0);
  const [classificationReady, setClassificationReady] = useState(false);
  const [trackerHealth, setTrackerHealth] = useState<TrackerHealthSnapshot>(() => (
    resolveTrackerHealth(null, Date.now(), TRACKER_HEARTBEAT_STALE_AFTER_MS)
  ));
  useDesktopLaunchBehaviorSync(appSettings);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    let stopTrackerHealthPolling: (() => void) | null = null;

    const init = async () => {
      try {
        const bootstrap = await loadAppRuntimeBootstrapSnapshot();
        if (cancelled) return;

        setAppSettings(bootstrap.settings);
        setActiveWindow(bootstrap.activeWindow);
        setTrackerHealth(bootstrap.trackerHealth);
        setClassificationReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error("Tracking init error", err);
        setClassificationReady(true);
      }

      if (cancelled) return;

      const activeWindowUnlisten = await subscribeActiveWindowChanged((window) => {
        if (cancelled) return;
        setActiveWindow(window);
      });
      if (cancelled) {
        activeWindowUnlisten();
        return;
      }
      unlisteners.push(activeWindowUnlisten);

      const trackingDataUnlisten = await subscribeTrackingDataChanged(
        (payload) => {
          if (cancelled) return;

          if (shouldSyncTrackingPause(payload.reason)) {
            void loadLatestTrackingPauseSetting()
              .then((trackingPaused) => {
                if (cancelled) return;
                setAppSettings((current) => ({
                  ...current,
                  tracking_paused: trackingPaused,
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

      stopTrackerHealthPolling = startTrackerHealthPolling((snapshot) => {
        if (!cancelled) {
          setTrackerHealth(snapshot);
        }
      });
    };

    void init();

    return () => {
      cancelled = true;
      for (const off of unlisteners) {
        off();
      }
      if (stopTrackerHealthPolling) {
        stopTrackerHealthPolling();
      }
    };
  }, []);

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    classificationReady,
    syncTick,
    trackerHealth,
  };
}
