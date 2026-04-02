import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProcessMapper } from "../lib/ProcessMapper";
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from "../lib/settings";
import { endActiveSession, loadActiveSession, startSession } from "../lib/db";

export interface WindowInfo {
  title: string;
  exe_name: string;
  process_path: string;
  is_afk: boolean;
}

export function useWindowTracking() {
  const [activeWindow, setActiveWindow] = useState<WindowInfo | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [syncTick, setSyncTick] = useState(0);
  const lastWindowRef = useRef<WindowInfo | null>(null);

  const isTrackableWindow = (win: WindowInfo | null) => {
    if (!win?.exe_name || !win.process_path) return false;
    if (win.is_afk) return false;
    return ProcessMapper.shouldTrack(win.exe_name);
  };

  const syncCurrentWindow = async (win: WindowInfo) => {
    const last = lastWindowRef.current;
    const lastTrackable = isTrackableWindow(last);
    const nextTrackable = isTrackableWindow(win);
    const identityChanged = last?.exe_name !== win.exe_name || last?.title !== win.title;
    const trackingStateChanged = lastTrackable !== nextTrackable;
    const afkCutoffTime = Date.now() - appSettings.afk_timeout_secs * 1000;

    if (lastTrackable && (identityChanged || trackingStateChanged)) {
      const shouldBackdateForAfk = !nextTrackable && win.is_afk;
      await endActiveSession(
        appSettings.min_session_secs,
        shouldBackdateForAfk ? afkCutoffTime : undefined
      );
    }

    if (nextTrackable && (identityChanged || trackingStateChanged)) {
      const mappedApp = ProcessMapper.map(win.exe_name);
      await startSession({
        app_name: mappedApp.name,
        exe_name: win.exe_name,
        window_title: win.title,
        process_path: win.process_path,
      });
    }

    if (identityChanged || trackingStateChanged) {
      setSyncTick((t) => t + 1);
    }

    lastWindowRef.current = win;
    setActiveWindow(win);
  };

  useEffect(() => {
    let unlistener: () => void;

    const init = async () => {
      try {
        const _settings = await loadSettings();
        setAppSettings(_settings);
        await invoke("cmd_set_afk_timeout", { timeoutSecs: _settings.afk_timeout_secs }).catch(console.warn);

        const existingSession = await loadActiveSession().catch(() => null);
        if (existingSession) {
          await endActiveSession(_settings.min_session_secs);
        }

        const currentWin = await invoke<WindowInfo>("get_current_active_window").catch(() => null);
        if (currentWin) {
          await syncCurrentWindow(currentWin);
        }
      } catch (err) {
        console.error("Tracking init error", err);
      }

      const unlistenPromise = listen<WindowInfo>("active-window-changed", async (event) => {
        await syncCurrentWindow(event.payload);
      });
      unlistener = () => { unlistenPromise.then((u) => u()); };
    };

    void init();

    const handleBeforeUnload = () => {
      endActiveSession(appSettings.min_session_secs);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (unlistener) unlistener();
    };
  }, [appSettings.min_session_secs]);

  return {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
  };
}
