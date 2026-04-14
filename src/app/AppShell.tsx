import { Suspense, lazy, useCallback, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { UI_TEXT } from "../lib/copy";
import Sidebar from "../shared/components/Sidebar";
import Dashboard from "../features/dashboard/components/Dashboard";
import ToastStack, { type ToastItem, type ToastTone } from "../shared/components/ToastStack";
import { useDashboardStats } from "../features/dashboard/hooks/useDashboardStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import { AppSettingsRuntimeService } from "./services/appSettingsRuntimeService";
import {
  loadDashboardRuntimeSnapshot,
  loadHistoryRuntimeSnapshot,
} from "./services/readModelRuntimeService";
import type { View } from "../shared/types/app";
import { AppClassificationFacade } from "../shared/lib/appClassificationFacade";
import { useQuietDialogs } from "../shared/hooks/useQuietDialogs";
import UpdateDialogProvider from "./providers/UpdateDialogProvider";
import { useUpdateDialog } from "./hooks/useUpdateDialog";

const History = lazy(() => import("../features/history/components/History"));
const Settings = lazy(() => import("../features/settings/components/Settings"));
const AppMapping = lazy(() => import("../features/classification/components/AppMapping"));

export default function AppShell() {
  return (
    <UpdateDialogProvider>
      <AppShellContent />
    </UpdateDialogProvider>
  );
}

function AppShellContent() {
  const { confirm, dialogs } = useQuietDialogs();
  const {
    snapshot: updateSnapshot,
    isChecking: isUpdateChecking,
    isInstalling: isUpdateInstalling,
    shouldShowSidebarEntry,
    openUpdateDialog,
    checkForUpdates,
  } = useUpdateDialog();
  const settingsSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const mappingSaveHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [viewDirtyState, setViewDirtyState] = useState<{ settings: boolean; mapping: boolean }>({
    settings: false,
    mapping: false,
  });
  const [mappingVersion, setMappingVersion] = useState(0);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const {
    activeWindow,
    appSettings,
    classificationReady,
    setAppSettings,
    syncTick,
    trackerHealth,
  } = useWindowTracking();
  const refreshSignal = syncTick + dataRefreshTick;
  const { dashboard, icons } = useDashboardStats(
    appSettings.refresh_interval_secs,
    refreshSignal,
    trackerHealth,
    loadDashboardRuntimeSnapshot,
    mappingVersion,
    classificationReady,
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

  const handleNavigate = useCallback((nextView: View) => {
    void (async () => {
      if (nextView === currentView) {
        return;
      }

      const hasUnsavedChanges = viewDirtyState.settings || viewDirtyState.mapping;
      if (!hasUnsavedChanges) {
        setCurrentView(nextView);
        return;
      }

      const confirmed = await confirm({
        title: UI_TEXT.app.unsavedConfirmTitle,
        description: UI_TEXT.app.unsavedConfirmBody,
        confirmLabel: UI_TEXT.app.unsavedConfirmSave,
      });
      if (!confirmed) {
        return;
      }

      const saveHandler = currentView === "settings"
        ? settingsSaveHandlerRef.current
        : currentView === "mapping"
          ? mappingSaveHandlerRef.current
          : null;
      const didSave = saveHandler ? await saveHandler() : false;
      if (!didSave) {
        return;
      }

      setViewDirtyState((current) => {
        if (currentView === "settings") {
          return { ...current, settings: false };
        }
        if (currentView === "mapping") {
          return { ...current, mapping: false };
        }
        return current;
      });
      setCurrentView(nextView);
    })();
  }, [confirm, currentView, viewDirtyState]);

  return (
    <div className="qp-shell h-screen p-4 md:p-5 lg:p-6 flex gap-4 md:gap-5 lg:gap-6 overflow-hidden">
      <ToastStack toasts={toasts} />
      {dialogs}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        showUpdateEntry={shouldShowSidebarEntry}
        onOpenUpdateDialog={openUpdateDialog}
      />

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
                mergeThresholdSecs={appSettings.timeline_merge_gap_secs}
                minSessionSecs={appSettings.min_session_secs}
                onMinSessionSecsChange={handleMinSessionSecsChange}
                trackerHealth={trackerHealth}
                loadHistorySnapshot={loadHistoryRuntimeSnapshot}
                mappingVersion={mappingVersion}
              />
            )}
            {currentView === "settings" && (
              <Settings
                key="settings"
                onSettingsChanged={setAppSettings}
                updateSnapshot={updateSnapshot}
                updateChecking={isUpdateChecking}
                updateInstalling={isUpdateInstalling}
                onCheckForUpdates={async () => {
                  await checkForUpdates(false);
                }}
                onOpenUpdateDialog={openUpdateDialog}
                onRegisterSaveHandler={(handler) => {
                  settingsSaveHandlerRef.current = handler;
                }}
                onDirtyChange={(dirty) => {
                  setViewDirtyState((current) => ({ ...current, settings: dirty }));
                }}
                onToast={pushToast}
              />
            )}
            {currentView === "mapping" && (
              <AppMapping
                key="mapping"
                icons={icons}
                onRegisterSaveHandler={(handler) => {
                  mappingSaveHandlerRef.current = handler;
                }}
                onDirtyChange={(dirty) => {
                  setViewDirtyState((current) => ({ ...current, mapping: dirty }));
                }}
                onOverridesChanged={() => {
                  setMappingVersion((version) => version + 1);
                  setDataRefreshTick((tick) => tick + 1);
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
