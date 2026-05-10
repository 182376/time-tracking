import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { UI_TEXT } from "../shared/copy/uiText.ts";
import AppSidebar from "./components/AppSidebar";
import AppTitleBar from "./components/AppTitleBar";
import Dashboard from "../features/dashboard/components/Dashboard";
import { watchCurrentWindowMaximized } from "../platform/desktop/windowControlGateway";
import QuietToastStack from "../shared/components/QuietToastStack";
import type { ThemeMode } from "../shared/settings/appSettings.ts";
import type { ColorSchemePreview } from "../features/settings/types.ts";
import { useDashboardStats } from "../features/dashboard/hooks/useDashboardStats";
import { useWindowTracking } from "./hooks/useWindowTracking";
import {
  applyMappingOverridesReadModelRefresh,
  applySessionDeletionReadModelRefresh,
  INITIAL_READ_MODEL_REFRESH_STATE,
  resolveReadModelRefreshSignal,
} from "./services/readModelRefreshState.ts";
import {
  loadDashboardRuntimeSnapshot,
  loadHistoryRuntimeSnapshot,
} from "./services/readModelRuntimeService";
import {
  prewarmStartupBootstrapCaches,
  prewarmStartupSnapshotCaches,
} from "./services/startupPrewarmService";
import { AppClassification } from "../shared/classification/appClassification.ts";
import { useQuietDialogs } from "../shared/hooks/useQuietDialogs";
import UpdateDialogProvider from "./providers/UpdateDialogProvider";
import { useAppShellNavigation } from "./hooks/useAppShellNavigation";
import { useAppShellToasts } from "./hooks/useAppShellToasts";
import { useAppShellUpdateEntry } from "./hooks/useAppShellUpdateEntry";
import { useAppThemeMode } from "./hooks/useAppThemeMode.ts";
import { saveMinSessionSecsSetting } from "./services/appSettingsRuntimeService.ts";

const History = lazy(() => import("../features/history/components/History"));
const Data = lazy(() => import("../features/data/components/Data"));
const Settings = lazy(() => import("../features/settings/components/Settings"));
const About = lazy(() => import("../features/about/components/About"));
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
  const { sidebarUpdateEntry, settingsUpdateEntry } = useAppShellUpdateEntry();
  const {
    currentView,
    handleNavigate,
    registerSettingsSaveHandler,
    registerMappingSaveHandler,
    setSettingsDirty,
    setMappingDirty,
  } = useAppShellNavigation({ confirm });
  const { toasts, pushToast } = useAppShellToasts();
  const [readModelRefreshState, setReadModelRefreshState] = useState(INITIAL_READ_MODEL_REFRESH_STATE);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [settingsThemeModePreview, setSettingsThemeModePreview] = useState<ThemeMode | null>(null);
  const [settingsColorSchemePreview, setSettingsColorSchemePreview] = useState<ColorSchemePreview | null>(null);
  const didPrewarmBootstrapCachesRef = useRef(false);
  const didPrewarmSnapshotCachesRef = useRef(false);
  const {
    activeWindow,
    trackingStatus,
    appSettings,
    classificationReady,
    setAppSettings,
    syncTick,
    trackerHealth,
  } = useWindowTracking();
  useAppThemeMode(
    settingsThemeModePreview ?? appSettings.themeMode,
    settingsColorSchemePreview?.light ?? appSettings.colorSchemeLight,
    settingsColorSchemePreview?.dark ?? appSettings.colorSchemeDark,
  );
  const refreshSignal = resolveReadModelRefreshSignal(syncTick, readModelRefreshState);
  const { mappingVersion } = readModelRefreshState;
  const { dashboard, icons } = useDashboardStats(
    appSettings.refreshIntervalSecs,
    refreshSignal,
    trackerHealth,
    loadDashboardRuntimeSnapshot,
    mappingVersion,
    classificationReady,
  );

  const activeExeName = activeWindow?.exeName ?? null;
  const mappedActiveApp = activeExeName && AppClassification.shouldTrackApp(activeExeName)
    ? AppClassification.mapApp(activeExeName)
    : null;
  const activeApp = trackerHealth.status === "healthy"
    && !appSettings.trackingPaused
    && mappedActiveApp
    && trackingStatus.isTrackingActive
    ? mappedActiveApp
    : null;

  useEffect(() => {
    if (didPrewarmBootstrapCachesRef.current) return;
    didPrewarmBootstrapCachesRef.current = true;
    void prewarmStartupBootstrapCaches();
  }, []);

  useEffect(() => {
    if (!classificationReady || didPrewarmSnapshotCachesRef.current) return;
    didPrewarmSnapshotCachesRef.current = true;
    void prewarmStartupSnapshotCaches(new Date());
  }, [classificationReady]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void watchCurrentWindowMaximized((maximized) => {
      if (!disposed) {
        setIsWindowMaximized(maximized);
      }
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch((error) => {
        console.warn("watch current window maximized state failed", error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleMinSessionSecsChange = useCallback((nextValue: number) => {
    setAppSettings((current) => ({
      ...current,
      minSessionSecs: nextValue,
    }));
    void saveMinSessionSecsSetting(nextValue).catch(console.warn);
  }, [setAppSettings]);

  return (
    <div className={isWindowMaximized ? "qp-app-frame qp-app-frame-maximized" : "qp-app-frame"}>
      <AppTitleBar isMaximized={isWindowMaximized} />

      <div className="qp-shell flex-1 min-h-0 p-4 md:p-5 lg:p-6 flex gap-4 md:gap-5 lg:gap-6 overflow-hidden">
        <QuietToastStack toasts={toasts} />
        {dialogs}
        <AppSidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          {...sidebarUpdateEntry}
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
                  isAfk={activeWindow?.isAfk ?? false}
                  isTrackingActive={activeApp !== null}
                  activeAppName={activeApp?.name ?? null}
                  trackingPaused={appSettings.trackingPaused}
                />
              )}
              {currentView === "history" && (
                <History
                  key="history"
                  icons={icons}
                  refreshKey={refreshSignal}
                  refreshIntervalSecs={appSettings.refreshIntervalSecs}
                  mergeThresholdSecs={appSettings.timelineMergeGapSecs}
                  minSessionSecs={appSettings.minSessionSecs}
                  onMinSessionSecsChange={handleMinSessionSecsChange}
                  trackerHealth={trackerHealth}
                  loadHistorySnapshot={loadHistoryRuntimeSnapshot}
                  mappingVersion={mappingVersion}
                />
              )}
              {currentView === "data" && (
                <Data
                  key="data"
                  icons={icons}
                  refreshKey={refreshSignal}
                  trackerHealth={trackerHealth}
                  loadHistorySnapshot={loadHistoryRuntimeSnapshot}
                  mappingVersion={mappingVersion}
                />
              )}
              {currentView === "settings" && (
                <Settings
                  key="settings"
                  onSettingsChanged={(nextSettings) => {
                    setAppSettings(nextSettings);
                    setSettingsThemeModePreview(null);
                    setSettingsColorSchemePreview(null);
                  }}
                  onRegisterSaveHandler={registerSettingsSaveHandler}
                  onDirtyChange={setSettingsDirty}
                  onThemeModePreview={setSettingsThemeModePreview}
                  onColorSchemePreview={setSettingsColorSchemePreview}
                  onToast={pushToast}
                />
              )}
              {currentView === "about" && (
                <About
                  key="about"
                  {...settingsUpdateEntry}
                  onToast={pushToast}
                />
              )}
              {currentView === "mapping" && (
                <AppMapping
                  key="mapping"
                  icons={icons}
                  onRegisterSaveHandler={registerMappingSaveHandler}
                  onDirtyChange={setMappingDirty}
                  onOverridesChanged={() => {
                    setReadModelRefreshState(applyMappingOverridesReadModelRefresh);
                    pushToast(UI_TEXT.app.mappingUpdated, "success");
                  }}
                  onSessionsDeleted={() => {
                    setReadModelRefreshState(applySessionDeletionReadModelRefresh);
                    pushToast(UI_TEXT.app.historyDeleted, "success");
                  }}
                />
              )}
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
