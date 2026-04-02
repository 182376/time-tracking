import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence } from "framer-motion";
import { startSession, endActiveSession, getDailyStats, getIconMap } from "./lib/db";
import { ProcessMapper } from "./lib/ProcessMapper";
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from "./lib/settings";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import Settings from "./components/Settings";
import "./App.css";

interface WindowInfo {
  title: string;
  exe_name: string;
  process_path: string;
  is_afk: boolean;
}

export interface AppStat {
  app_name: string;
  exe_name: string;
  total_duration: number;
}

type View = "dashboard" | "history" | "settings";

export default function App() {
  const [activeWindow, setActiveWindow] = useState<WindowInfo | null>(null);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [stats, setStats] = useState<AppStat[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const lastWindowRef = useRef<WindowInfo | null>(null);

  const fetchData = async () => {
    try {
      const [statsData, iconsData] = await Promise.all([getDailyStats(), getIconMap()]);
      setStats(statsData || []);
      setIcons(iconsData || {});
    } catch (err: any) {
      console.error("Failed to load stats:", err);
    }
  };

  const syncCurrentWindow = async (win: WindowInfo) => {
    if (!win.exe_name || !win.process_path) return;

    const last = lastWindowRef.current;
    if (last?.exe_name !== win.exe_name || last?.title !== win.title) {
      if (last && !last.is_afk) await endActiveSession();
      if (!win.is_afk) {
        const mappedApp = ProcessMapper.map(win.exe_name);
        await startSession({
          app_name: mappedApp.name,
          exe_name: win.exe_name,
          window_title: win.title,
          process_path: win.process_path,
        });
      }
    }
    lastWindowRef.current = win;
    setActiveWindow(win);
  };

  useEffect(() => {
    const initSync = async () => {
      try {
        const s = await loadSettings();
        setAppSettings(s);
        // initialize backend afk timeout
        await invoke("cmd_set_afk_timeout", { timeoutSecs: s.afk_timeout_secs }).catch(console.warn);

        await fetchData();
        const currentWin = await invoke<WindowInfo>("get_current_active_window").catch(() => null);
        if (currentWin) {
          await syncCurrentWindow(currentWin);
          await fetchData();
        }
      } catch (err: any) {
        console.error("Init Sync Error:", err);
      }
    };

    initSync();

    const unlistenPromise = listen<WindowInfo>("active-window-changed", async (event) => {
      await syncCurrentWindow(event.payload);
      fetchData();
    });

    const timer = setInterval(fetchData, appSettings.refresh_interval_secs * 1000);

    const handleBeforeUnload = () => { endActiveSession(appSettings.min_session_secs); };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlistenPromise.then((u) => u());
      clearInterval(timer);
    };
  }, [appSettings.refresh_interval_secs]);

  const activeApp = activeWindow ? ProcessMapper.map(activeWindow.exe_name) : null;

  return (
    <div className="min-h-screen p-6 flex gap-6 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="flex-1 flex flex-col gap-6 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {currentView === "dashboard" && (
            <Dashboard
              key="dashboard"
              stats={stats}
              icons={icons}
              isAfk={activeWindow?.is_afk ?? false}
              activeAppName={activeApp?.name ?? null}
            />
          )}
          {currentView === "history" && (
            <History key="history" icons={icons} />
          )}
          {currentView === "settings" && (
            <Settings key="settings" onSettingsChanged={setAppSettings} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
