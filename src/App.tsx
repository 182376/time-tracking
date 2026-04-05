import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ProcessMapper } from "./lib/ProcessMapper";
import { UI_TEXT } from "./lib/copy";
import { resolveCanonicalExecutable, shouldTrackProcess } from "./lib/processNormalization";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ToastStack, { type ToastItem, type ToastTone } from "./components/ToastStack";
import { useStats } from "./hooks/useStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import { SettingsService } from "./lib/services/SettingsService";
import type { View } from "./types/app";
import "./App.css";

const History = lazy(() => import("./components/History"));
const Settings = lazy(() => import("./components/Settings"));
const AppMapping = lazy(() => import("./components/AppMapping"));

export default function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [mappingVersion, setMappingVersion] = useState(0);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [staleTipDismissed, setStaleTipDismissed] = useState(false);
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
    && !appSettings.tracking_paused
    && activeCanonicalExe
    && !activeWindow?.is_afk
    && shouldTrackProcess(activeCanonicalExe)
    && ProcessMapper.shouldTrack(activeCanonicalExe)
    ? ProcessMapper.map(activeCanonicalExe)
    : null;

  const handleMinSessionSecsChange = useCallback((nextValue: number) => {
    setAppSettings((current) => ({
      ...current,
      min_session_secs: nextValue,
    }));
    void SettingsService.updateSetting("min_session_secs", nextValue).catch(console.warn);
  }, [setAppSettings]);

  const pushToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    if (trackerHealth.status === "healthy") {
      setStaleTipDismissed(false);
    }
  }, [trackerHealth.status]);

  const showTrackerStaleTip = trackerHealth.status === "stale" && !staleTipDismissed;

  return (
    <div className="h-screen p-6 flex gap-6 overflow-hidden">
      <ToastStack toasts={toasts} />
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <main className="flex-1 min-h-0 flex flex-col gap-6 relative overflow-hidden">
        {showTrackerStaleTip && (
          <div className="glass-card border-amber-100 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 flex items-center justify-between">
            <span>追踪引擎短暂中断，当前展示已自动冻结到最近有效采样点。</span>
            <button
              type="button"
              onClick={() => setStaleTipDismissed(true)}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
            >
              知道了
            </button>
          </div>
        )}
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
                  pushToast("应用映射已更新。", "success");
                }}
                onSessionsDeleted={() => {
                  setDataRefreshTick((tick) => tick + 1);
                  pushToast("应用历史已删除。", "success");
                }}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
