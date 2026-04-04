import { Suspense, lazy, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ProcessMapper } from "./lib/ProcessMapper";
import { UI_TEXT } from "./lib/copy";
import { resolveCanonicalExecutable, shouldTrackProcess } from "./lib/processNormalization";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import { useStats } from "./hooks/useStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import type { View } from "./types/app";
import "./App.css";

const History = lazy(() => import("./components/History"));
const Settings = lazy(() => import("./components/Settings"));
const AppMapping = lazy(() => import("./components/AppMapping"));

export default function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [mappingVersion, setMappingVersion] = useState(0);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
    trackerHealth,
  } = useWindowTracking();
  const refreshSignal = syncTick + dataRefreshTick;
  const { dashboard, icons } = useStats(
    appSettings.refresh_interval_secs,
    refreshSignal,
    trackerHealth,
    mappingVersion,
  );

  const activeCanonicalExe = activeWindow?.exe_name
    ? resolveCanonicalExecutable(activeWindow.exe_name)
    : null;
  const activeApp = trackerHealth.status === "healthy"
    && activeCanonicalExe
    && !activeWindow?.is_afk
    && shouldTrackProcess(activeCanonicalExe)
    && ProcessMapper.shouldTrack(activeCanonicalExe)
    ? ProcessMapper.map(activeCanonicalExe)
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
              />
            )}
            {currentView === "history" && (
              <History
                key="history"
                icons={icons}
                refreshKey={refreshSignal}
                refreshIntervalSecs={appSettings.refresh_interval_secs}
                mergeThresholdSecs={appSettings.afk_timeout_secs}
                minSessionSecs={appSettings.min_session_secs}
                trackerHealth={trackerHealth}
                mappingVersion={mappingVersion}
              />
            )}
            {currentView === "settings" && (
              <Settings
                key="settings"
                onSettingsChanged={setAppSettings}
              />
            )}
            {currentView === "mapping" && (
              <AppMapping
                key="mapping"
                icons={icons}
                refreshKey={refreshSignal}
                onOverridesChanged={() => {
                  setMappingVersion((version) => version + 1);
                }}
                onSessionsDeleted={() => {
                  setDataRefreshTick((tick) => tick + 1);
                }}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
