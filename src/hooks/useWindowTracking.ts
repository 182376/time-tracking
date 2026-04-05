import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
} from "../lib/settings";
import type { AppSettings } from "../lib/settings";
import { SettingsService } from "../lib/services/SettingsService";
import { ProcessMapper } from "../lib/ProcessMapper";
import {
  TrackingService,
} from "../lib/services/TrackingService";
import type {
  TrackerHealthSnapshot,
  TrackingWindowSnapshot,
} from "../types/tracking";
import { resolveTrackerHealth } from "../types/tracking";

const TRACKER_HEARTBEAT_POLL_MS = 1_000;
const TRACKER_HEARTBEAT_STALE_AFTER_MS = 8_000;

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
      try {
        const lastHeartbeatMs = await SettingsService.loadTrackerHealthTimestamp();
        if (cancelled) return;

        setTrackerHealth(resolveTrackerHealth(
          lastHeartbeatMs,
          Date.now(),
          TRACKER_HEARTBEAT_STALE_AFTER_MS,
        ));
      } catch (error) {
        if (cancelled) return;
        console.warn("Failed to load tracker heartbeat", error);
        setTrackerHealth(resolveTrackerHealth(
          null,
          Date.now(),
          TRACKER_HEARTBEAT_STALE_AFTER_MS,
        ));
      }
    };

    const init = async () => {
      try {
        const settings = await SettingsService.load();
        if (cancelled) return;

        setAppSettings(settings);
        await TrackingService.setAfkTimeout(settings.afk_timeout_secs).catch(console.warn);
        if (cancelled) return;

        const overrides = await SettingsService.loadAppOverrides();
        if (!cancelled) {
          ProcessMapper.setUserOverrides(overrides);
        }

        const currentWin = await TrackingService.getCurrentWindow();
        if (!cancelled && currentWin) {
          setActiveWindow(currentWin);
        }

        await refreshTrackerHealth();
      } catch (err) {
        if (cancelled) return;
        console.error("Tracking init error", err);
      }

      if (cancelled) return;

      // Rust owns session persistence now. The frontend only listens for:
      // 1. active-window updates for display state
      // 2. tracking-data invalidations for reloading dashboard/history data
      const activeWindowUnlisten = await TrackingService.onActiveWindowChanged((window) => {
        if (cancelled) return;
        setActiveWindow(window);
      });
      if (cancelled) {
        activeWindowUnlisten();
        return;
      }
      unlisteners.push(activeWindowUnlisten);

      const trackingDataUnlisten = await TrackingService.onTrackingDataChanged(
        () => {
          if (cancelled) return;
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

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
    trackerHealth,
  };
}
