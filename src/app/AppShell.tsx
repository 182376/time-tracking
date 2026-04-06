import { Suspense, lazy, useCallback, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { UI_TEXT } from "../lib/copy";
import Sidebar from "../shared/components/Sidebar";
import Dashboard from "../features/dashboard/components/Dashboard";
import ToastStack, { type ToastItem, type ToastTone } from "../shared/components/ToastStack";
import { useDashboardStats } from "../features/dashboard/hooks/useDashboardStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import { AppSettingsRuntimeService } from "./services/appSettingsRuntimeService";
import type { View } from "../shared/types/app";
import { AppClassificationFacade } from "../shared/lib/appClassificationFacade";

const History = lazy(() => import("../features/history/components/History"));
const Settings = lazy(() => import("../features/settings/components/Settings"));
const AppMapping = lazy(() => import("../features/classification/components/AppMapping"));

export default function AppShell() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [mappingVersion, setMappingVersion] = useState(0);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const {
    activeWindow,
    appSettings,
    setAppSettings,
    syncTick,
    trackerHealth,
  } = useWindowTracking();
  const refreshSignal = syncTick + dataRefreshTick;
  const { dashboard, icons } = useDashboardStats(
    appSettings.refresh_interval_secs,
    refreshSignal,
    trackerHealth,
    mappingVersion,
  );

  const activeExeName = activeWindow?.exe_name ?? null;
  const activeApp = trackerHealth.status === "healthy"
    && !appSettings.tracking_paused
    && activeExeName
    && !activeWindow?.is_afk
    && AppClassificationFacade.shouldTrackApp(activeExeName)
    ? AppClassificationFacade.mapApp(activeExeName)
    : null;

  const handleMinSessionSecsChange = useCallback((nextValue: number) => {
    setAppSettings((current) => ({
      ...current,
      min_session_secs: nextValue,
    }));
    void AppSettingsRuntimeService.updateSetting("min_session_secs", nextValue).catch(console.warn);
  }, [setAppSettings]);

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  return (
    <div className="qp-shell h-screen p-4 md:p-5 lg:p-6 flex gap-4 md:gap-5 lg:gap-6 overflow-hidden">
      <ToastStack toasts={toasts} />
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="qp-canvas flex-1 min-h-0 flex flex-col gap-4 md:gap-5 p-4 md:p-5 relative overflow-hidden">
        <Suspense
          fallback={
            <div className="flex-1 min-h-0 flex items-center justify-center text-[var(--qp-text-tertiary)] text-sm">
              {UI_TEXT.app.loadingView}
            </div>
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {currentView === "dashboard" && (
              <Dashboard
                key="dashboard"
                dashboard={dashboard}
                icons={icons}
                isAfk={activeWindow?.is_afk ?? false}
                activeAppName={activeApp?.name ?? null}
                trackingPaused={appSettings.tracking_paused}
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
                onMinSessionSecsChange={handleMinSessionSecsChange}
                trackerHealth={trackerHealth}
                mappingVersion={mappingVersion}
              />
            )}
            {currentView === "settings" && (
              <Settings
                key="settings"
                onSettingsChanged={setAppSettings}
                onToast={pushToast}
              />
            )}
            {currentView === "mapping" && (
              <AppMapping
                key="mapping"
                icons={icons}
                refreshKey={refreshSignal}
                onOverridesChanged={() => {
                  setMappingVersion((version) => version + 1);
                  pushToast(UI_TEXT.app.mappingUpdated, "success");
                }}
                onSessionsDeleted={() => {
                  setDataRefreshTick((tick) => tick + 1);
                  pushToast(UI_TEXT.app.historyDeleted, "success");
                }}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
