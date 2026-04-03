import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProcessMapper } from "../lib/ProcessMapper";
import type { RawPowerEvent } from "../lib/rawEvents";
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from "../lib/settings";
import { endActiveSession, flushRawEventQueue, loadActiveSession, rebuildDerivedSessions, recordRawPowerEvent, recordRawTrackingSnapshot, startSession } from "../lib/db";
import { planPowerTransition, planWindowTransition, TrackedWindow } from "../lib/services/trackingLifecycle";

export interface WindowInfo extends TrackedWindow {}

const POWER_EVENT_SOURCE = "power_lifecycle_v1" as const;

export function useWindowTracking() {
  const [activeWindow, setActiveWindow] = useState<WindowInfo | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [syncTick, setSyncTick] = useState(0);
  const lastWindowRef = useRef<WindowInfo | null>(null);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    settingsRef.current = appSettings;
  }, [appSettings]);

  const enqueueSyncTask = (task: () => Promise<void>) => {
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(() => task())
      .catch((error) => {
        console.error("Tracking sync error", error);
      });

    return syncQueueRef.current;
  };

  const applyWindowSync = async (win: WindowInfo) => {
    const settings = settingsRef.current;
    const nowMs = Date.now();
    const decision = planWindowTransition({
      previousWindow: lastWindowRef.current,
      nextWindow: win,
      settings,
      nowMs,
      shouldTrack: (exeName) => ProcessMapper.shouldTrack(exeName),
    });

    await recordRawTrackingSnapshot(win, nowMs).catch((error) => {
      console.warn("Raw tracking snapshot write failed", error);
    });

    if (decision.shouldEndPrevious) {
      await endActiveSession(
        settings.min_session_secs,
        decision.endTimeOverride
      );
    }

    if (decision.shouldStartNext) {
      const mappedApp = ProcessMapper.map(win.exe_name);
      await startSession({
        app_name: mappedApp.name,
        exe_name: win.exe_name,
        window_title: win.title,
        process_path: win.process_path,
      });
    }

    if (decision.didChange) {
      setSyncTick((t) => t + 1);
    }

    await rebuildDerivedSessions(settings.min_session_secs, nowMs).catch((error) => {
      console.warn("Derived session rebuild failed", error);
    });

    lastWindowRef.current = win;
    setActiveWindow(win);
  };

  const syncCurrentWindow = (win: WindowInfo) => {
    return enqueueSyncTask(() => applyWindowSync(win));
  };

  useEffect(() => {
    let cancelled = false;
    let windowUnlistener: (() => void) | null = null;
    let powerUnlistener: (() => void) | null = null;

    const handlePowerEvent = async (event: RawPowerEvent) => {
      await recordRawPowerEvent(event).catch((error) => {
        console.warn("Raw power event write failed", error);
      });

      const decision = planPowerTransition({
        state: event.state,
        timestampMs: event.timestamp_ms,
      });

      if (decision.shouldEndActiveSession) {
        await endActiveSession(
          settingsRef.current.min_session_secs,
          decision.endTimeOverride,
        );
      }

      if (decision.shouldResetWindowState) {
        lastWindowRef.current = null;
        setActiveWindow(null);
        setSyncTick((t) => t + 1);
      }

      await rebuildDerivedSessions(settingsRef.current.min_session_secs, event.timestamp_ms).catch((error) => {
        console.warn("Derived session rebuild failed", error);
      });
    };

    const init = async () => {
      try {
        await flushRawEventQueue().catch((error) => {
          console.warn("Raw event queue replay failed", error);
        });
        if (cancelled) return;

        await recordRawPowerEvent({
          timestamp_ms: Date.now(),
          state: "startup",
          source: POWER_EVENT_SOURCE,
        }).catch((error) => {
          console.warn("Startup power event write failed", error);
        });
        if (cancelled) return;

        const _settings = await loadSettings();
        if (cancelled) return;
        setAppSettings(_settings);
        settingsRef.current = _settings;
        await invoke("cmd_set_afk_timeout", { timeoutSecs: _settings.afk_timeout_secs }).catch(console.warn);
        if (cancelled) return;

        const existingSession = await loadActiveSession().catch(() => null);
        if (cancelled) return;
        if (existingSession) {
          await endActiveSession(_settings.min_session_secs);
          if (cancelled) return;
        }

        const currentWin = await invoke<WindowInfo>("get_current_active_window").catch(() => null);
        if (!cancelled && currentWin) {
          await syncCurrentWindow(currentWin);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Tracking init error", err);
      }

      if (cancelled) return;

      powerUnlistener = await listen<RawPowerEvent>("power-lifecycle-changed", async (event) => {
        if (cancelled) return;
        await enqueueSyncTask(() => handlePowerEvent(event.payload));
      });

      if (cancelled && powerUnlistener) {
        powerUnlistener();
        powerUnlistener = null;
      }

      if (cancelled) return;

      windowUnlistener = await listen<WindowInfo>("active-window-changed", async (event) => {
        if (cancelled) return;
        await syncCurrentWindow(event.payload);
      });

      if (cancelled && windowUnlistener) {
        windowUnlistener();
        windowUnlistener = null;
      }
    };

    void init();

    const handleBeforeUnload = () => {
      const shutdownTimestampMs = Date.now();
      void recordRawPowerEvent({
        timestamp_ms: shutdownTimestampMs,
        state: "shutdown",
        source: POWER_EVENT_SOURCE,
      }).catch((error) => {
        console.warn("Shutdown power event write failed", error);
      });
      void endActiveSession(settingsRef.current.min_session_secs, shutdownTimestampMs);
      lastWindowRef.current = null;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (powerUnlistener) powerUnlistener();
      if (windowUnlistener) windowUnlistener();
    };
  }, []);

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
  };
}
