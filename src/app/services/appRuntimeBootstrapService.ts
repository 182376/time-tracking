import type {
  TrackerHealthSnapshot,
  TrackingStatusSnapshot,
  TrackingWindowSnapshot,
} from "../../shared/types/tracking.ts";
import { DEFAULT_TRACKING_STATUS, resolveTrackerHealth } from "../../shared/types/tracking.ts";
import type { AppSettings } from "./appSettingsRuntimeService.ts";
import {
  getCurrentTrackingSnapshot,
  setAfkThreshold,
} from "../../platform/runtime/trackingRuntimeGateway.ts";
import {
  loadCurrentAppSettings,
  loadTrackerHealthTimestampMs,
} from "./appSettingsRuntimeService.ts";
import { initializeProcessMapperRuntime } from "./processMapperRuntimeService.ts";

export const TRACKER_HEARTBEAT_STALE_AFTER_MS = 8_000;

export interface AppRuntimeBootstrapSnapshot {
  settings: AppSettings;
  activeWindow: TrackingWindowSnapshot | null;
  trackingStatus: TrackingStatusSnapshot;
  trackerHealth: TrackerHealthSnapshot;
}

interface AppRuntimeBootstrapDeps {
  loadCurrentAppSettings: () => Promise<AppSettings>;
  setAfkThreshold: (seconds: number) => Promise<void>;
  initializeProcessMapperRuntime: () => Promise<void>;
  getCurrentTrackingSnapshot: typeof getCurrentTrackingSnapshot;
  loadTrackerHealthSnapshot: (nowMs?: number) => Promise<TrackerHealthSnapshot>;
}

const appRuntimeBootstrapDeps: AppRuntimeBootstrapDeps = {
  loadCurrentAppSettings,
  setAfkThreshold,
  initializeProcessMapperRuntime,
  getCurrentTrackingSnapshot,
  loadTrackerHealthSnapshot,
};

export async function loadTrackerHealthSnapshot(nowMs: number = Date.now()): Promise<TrackerHealthSnapshot> {
  try {
    const lastHeartbeatMs = await loadTrackerHealthTimestampMs();
    return resolveTrackerHealth(lastHeartbeatMs, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  } catch (error) {
    console.warn("Failed to load tracker heartbeat", error);
    return resolveTrackerHealth(null, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  }
}

export async function loadAppRuntimeBootstrapSnapshot(): Promise<AppRuntimeBootstrapSnapshot> {
  return loadAppRuntimeBootstrapSnapshotWithDeps(appRuntimeBootstrapDeps);
}

export async function loadAppRuntimeBootstrapSnapshotWithDeps(
  deps: AppRuntimeBootstrapDeps,
): Promise<AppRuntimeBootstrapSnapshot> {
  const settings = await deps.loadCurrentAppSettings();
  await deps.setAfkThreshold(settings.timelineMergeGapSecs).catch(console.warn);

  await deps.initializeProcessMapperRuntime();

  const [trackingSnapshot, trackerHealth] = await Promise.all([
    deps.getCurrentTrackingSnapshot(),
    deps.loadTrackerHealthSnapshot(),
  ]);

  return {
    settings,
    activeWindow: trackingSnapshot?.window ?? null,
    trackingStatus: trackingSnapshot?.status ?? DEFAULT_TRACKING_STATUS,
    trackerHealth,
  };
}
