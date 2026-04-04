import { Suspense, lazy, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ProcessMapper } from "./lib/ProcessMapper";
import { UI_TEXT } from "./lib/copy";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import { useStats } from "./hooks/useStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import { View } from "./types/app";
import "./App.css";

const History = lazy(() => import("./components/History"));
const Settings = lazy(() => import("./components/Settings"));

export default function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
    trackerHealth,
  } = useWindowTracking();
  const { dashboard, icons } = useStats(
    appSettings.refresh_interval_secs,
    syncTick,
    trackerHealth,
  );

  const activeApp = trackerHealth.status === "healthy"
    && activeWindow?.exe_name
    && !activeWindow.is_afk
    && ProcessMapper.shouldTrack(activeWindow.exe_name)
    ? ProcessMapper.map(activeWindow.exe_name)
    : null;

  return (
    <div className="h-screen p-6 flex gap-6 overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="flex-1 min-h-0 flex flex-col gap-6 relative overflow-hidden">
        <Suspense
          fallback={
            <div className="flex-1 min-h-0 flex items-center justify-center text-slate-400 text-sm">
              {UI_TEXT.app.loadingView}
            </div>
          }
        >
          <AnimatePresence mode="wait">
            {currentView === "dashboard" && (
              <Dashboard
                key="dashboard"
                dashboard={dashboard}
                icons={icons}
                isAfk={activeWindow?.is_afk ?? false}
                activeAppName={activeApp?.name ?? null}
                trackerHealthStatus={trackerHealth.status}
              />
            )}
            {currentView === "history" && (
              <History
                key="history"
                icons={icons}
                refreshKey={syncTick}
                refreshIntervalSecs={appSettings.refresh_interval_secs}
                mergeThresholdSecs={appSettings.afk_timeout_secs}
                minSessionSecs={appSettings.min_session_secs}
                trackerHealth={trackerHealth}
              />
            )}
            {currentView === "settings" && (
              <Settings
                key="settings"
                onSettingsChanged={setAppSettings}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
