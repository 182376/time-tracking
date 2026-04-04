import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProcessMapper } from "../lib/ProcessMapper";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  loadTrackerHeartbeat,
  saveTrackerHeartbeat,
} from "../lib/settings";
import { endActiveSession, loadActiveSession, startSession } from "../lib/db";
import {
  planWindowTransition,
  resolveStartupSealTime,
  TrackedWindow,
} from "../lib/services/trackingLifecycle";

export interface WindowInfo extends TrackedWindow {}

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

    await saveTrackerHeartbeat(nowMs).catch((error) => {
      console.warn("Tracker heartbeat save failed", error);
    });

    lastWindowRef.current = win;
    setActiveWindow(win);
  };

  const syncCurrentWindow = (win: WindowInfo) => {
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(() => applyWindowSync(win))
      .catch((error) => {
        console.error("Window sync error", error);
      });

    return syncQueueRef.current;
  };

  useEffect(() => {
    let cancelled = false;
    let unlistener: (() => void) | null = null;

    const init = async () => {
      try {
        const _settings = await loadSettings();
        if (cancelled) return;
        setAppSettings(_settings);
        settingsRef.current = _settings;
        await invoke("cmd_set_afk_timeout", { timeoutSecs: _settings.afk_timeout_secs }).catch(console.warn);
        if (cancelled) return;

        const existingSession = await loadActiveSession().catch(() => null);
        const lastHeartbeatMs = await loadTrackerHeartbeat().catch(() => null);
        if (cancelled) return;
        if (existingSession) {
          await endActiveSession(
            _settings.min_session_secs,
            resolveStartupSealTime({
              sessionStartTime: existingSession.start_time,
              lastHeartbeatMs,
              nowMs: Date.now(),
            }),
          );
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

      unlistener = await listen<WindowInfo>("active-window-changed", async (event) => {
        if (cancelled) return;
        await syncCurrentWindow(event.payload);
      });

      if (cancelled && unlistener) {
        unlistener();
        unlistener = null;
      }
    };

    void init();

    const handleBeforeUnload = () => {
      const shutdownTimeMs = Date.now();
      void saveTrackerHeartbeat(shutdownTimeMs).catch((error) => {
        console.warn("Tracker heartbeat save failed", error);
      });
      void endActiveSession(settingsRef.current.min_session_secs, shutdownTimeMs);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (unlistener) unlistener();
    };
  }, []);

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
  };
}
