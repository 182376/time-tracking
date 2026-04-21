import { AppClassification } from "../../shared/classification/appClassification.ts";
import type { AppSettings } from "../../shared/settings/appSettings.ts";
import type {
  TrackerHealthSnapshot,
  TrackingStatusSnapshot,
  TrackingWindowSnapshot,
} from "../../shared/types/tracking.ts";

export type WidgetStatusTone = "tracking" | "tracking-sustained" | "paused" | "idle" | "error";

export interface WidgetViewModel {
  statusTone: WidgetStatusTone;
  statusLabel: string;
  appName: string;
  helperText: string;
  pauseActionLabel: string;
  showObjectSlot: boolean;
  objectIconKey: string | null;
}

const WIDGET_SELF_EXECUTABLES = new Set([
  "time-tracker.exe",
  "time-tracker",
  "time_tracker.exe",
  "time_tracker",
  "timetracker.exe",
  "timetracker",
  "time tracker.exe",
  "time tracker",
]);

const WIDGET_SELF_WINDOW_TITLES = new Set([
  "Time Tracker Widget",
  "Time Tracking",
]);

const TEXT = {
  tracking: "\u8ffd\u8e2a\u4e2d",
  sustainedTracking: "\u6301\u7eed\u53c2\u4e0e",
  currentApp: "\u5f53\u524d\u5e94\u7528",
  currentActivityRecording: "\u5f53\u524d\u6d3b\u52a8\u6b63\u5728\u8bb0\u5f55",
  currentSustainedRecording: "\u5f53\u524d\u6301\u7eed\u53c2\u4e0e\u6b63\u5728\u8bb0\u5f55",
  pause: "\u6682\u505c",
  resume: "\u6062\u590d",
  error: "\u5f02\u5e38",
  trackingService: "\u8ffd\u8e2a\u670d\u52a1",
  trackingNotSynced: "\u8ffd\u8e2a\u72b6\u6001\u6682\u65f6\u672a\u540c\u6b65",
  paused: "\u5df2\u6682\u505c",
  trackingPaused: "\u8ffd\u8e2a\u5df2\u6682\u505c",
  clickToResume: "\u70b9\u51fb\u5373\u53ef\u6062\u590d\u8ffd\u8e2a",
  idle: "\u7a7a\u95f2",
  currentlyIdle: "\u5f53\u524d\u7a7a\u95f2\u4e2d",
  currentAppNotTracked: "\u5f53\u524d\u5e94\u7528\u4e0d\u8ffd\u8e2a",
  noTrackableActivity: "\u5f53\u524d\u6682\u65e0\u53ef\u8ffd\u8e2a\u6d3b\u52a8",
  windowExcluded: "\u5f53\u524d\u7a97\u53e3\u4e0d\u4f1a\u8fdb\u5165\u8bb0\u5f55",
} as const;

export function isWidgetSelfWindow(activeWindow: TrackingWindowSnapshot | null): boolean {
  if (!activeWindow) {
    return false;
  }

  const normalizedExeName = AppClassification.normalizeExecutable(activeWindow.exe_name);
  if (WIDGET_SELF_EXECUTABLES.has(normalizedExeName)) {
    return true;
  }

  return WIDGET_SELF_WINDOW_TITLES.has(activeWindow.title.trim());
}

function resolveTrackableAppName(activeWindow: TrackingWindowSnapshot | null): string | null {
  const exeName = activeWindow?.exe_name?.trim();
  if (!exeName || !AppClassification.shouldTrackApp(exeName)) {
    return null;
  }

  return AppClassification.mapApp(exeName).name;
}

function isSustainedParticipationTracking(
  trackingStatus: TrackingStatusSnapshot,
  isTrackingForegroundApp: boolean,
) {
  return isTrackingForegroundApp && trackingStatus.sustained_participation_active;
}

function buildActiveTrackingViewModel(
  activeWindow: TrackingWindowSnapshot | null,
  trackableAppName: string | null,
  options: {
    statusTone: WidgetStatusTone;
    statusLabel: string;
    helperText: string;
  },
): WidgetViewModel {
  return {
    statusTone: options.statusTone,
    statusLabel: options.statusLabel,
    appName: trackableAppName ?? TEXT.currentApp,
    helperText: options.helperText,
    pauseActionLabel: TEXT.pause,
    showObjectSlot: true,
    objectIconKey: activeWindow ? AppClassification.resolveCanonicalExecutable(activeWindow.exe_name) : null,
  };
}

export function buildWidgetViewModel(
  activeWindow: TrackingWindowSnapshot | null,
  trackingStatus: TrackingStatusSnapshot,
  appSettings: AppSettings,
  trackerHealth: TrackerHealthSnapshot,
): WidgetViewModel {
  const trackableAppName = resolveTrackableAppName(activeWindow);
  const hasTrackableForegroundApp = trackableAppName !== null;
  const isTrackingForegroundApp = Boolean(
    activeWindow
    && !activeWindow.is_afk
    && hasTrackableForegroundApp
    && trackingStatus.is_tracking_active,
  );

  if (trackerHealth.status !== "healthy") {
    return {
      statusTone: "error",
      statusLabel: TEXT.error,
      appName: hasTrackableForegroundApp ? trackableAppName : TEXT.trackingService,
      helperText: TEXT.trackingNotSynced,
      pauseActionLabel: appSettings.tracking_paused ? TEXT.resume : TEXT.pause,
      showObjectSlot: false,
      objectIconKey: null,
    };
  }

  if (appSettings.tracking_paused) {
    return {
      statusTone: "paused",
      statusLabel: TEXT.paused,
      appName: hasTrackableForegroundApp ? trackableAppName : TEXT.trackingPaused,
      helperText: TEXT.clickToResume,
      pauseActionLabel: TEXT.resume,
      showObjectSlot: false,
      objectIconKey: null,
    };
  }

  if (!isTrackingForegroundApp) {
    return {
      statusTone: "idle",
      statusLabel: TEXT.idle,
      appName: activeWindow?.is_afk
        ? TEXT.currentlyIdle
        : hasTrackableForegroundApp
          ? trackableAppName
          : TEXT.currentAppNotTracked,
      helperText: activeWindow?.is_afk
        ? TEXT.noTrackableActivity
        : hasTrackableForegroundApp
          ? TEXT.noTrackableActivity
          : TEXT.windowExcluded,
      pauseActionLabel: TEXT.pause,
      showObjectSlot: false,
      objectIconKey: null,
    };
  }

  if (isSustainedParticipationTracking(trackingStatus, isTrackingForegroundApp)) {
    return buildActiveTrackingViewModel(activeWindow, trackableAppName, {
      statusTone: "tracking-sustained",
      statusLabel: TEXT.sustainedTracking,
      helperText: TEXT.currentSustainedRecording,
    });
  }

  return buildActiveTrackingViewModel(activeWindow, trackableAppName, {
    statusTone: "tracking",
    statusLabel: TEXT.tracking,
    helperText: TEXT.currentActivityRecording,
  });
}
