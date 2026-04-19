import type {
  TrackerHealthSnapshot,
  TrackingStatusSnapshot,
  TrackingWindowSnapshot,
} from "../../shared/types/tracking";
import type { AppSettings } from "../../shared/settings/appSettings";
import { resolveTrackerHealth } from "../../shared/types/tracking";
import {
  getCurrentTrackingSnapshot,
  setIdleTimeout,
} from "../../platform/runtime/trackingRuntimeGateway";
import { SettingsRuntimeAdapterService } from "../../features/settings/services/settingsRuntimeAdapterService";
import { initializeProcessMapperRuntime } from "./processMapperRuntimeService";

export const TRACKER_HEARTBEAT_STALE_AFTER_MS = 8_000;

export interface AppRuntimeBootstrapSnapshot {
  settings: AppSettings;
  activeWindow: TrackingWindowSnapshot | null;
  trackingStatus: TrackingStatusSnapshot;
  trackerHealth: TrackerHealthSnapshot;
}

const DEFAULT_TRACKING_STATUS: TrackingStatusSnapshot = {
  is_tracking_active: false,
  sustained_participation_eligible: false,
  sustained_participation_active: false,
  sustained_participation_kind: null,
};

export async function loadTrackerHealthSnapshot(nowMs: number = Date.now()): Promise<TrackerHealthSnapshot> {
  try {
    const lastHeartbeatMs = await SettingsRuntimeAdapterService.loadTrackerHealthTimestamp();
    return resolveTrackerHealth(lastHeartbeatMs, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  } catch (error) {
    console.warn("Failed to load tracker heartbeat", error);
    return resolveTrackerHealth(null, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  }
}

export async function loadAppRuntimeBootstrapSnapshot(): Promise<AppRuntimeBootstrapSnapshot> {
  const settings = await SettingsRuntimeAdapterService.loadCurrentSettings();
  await setIdleTimeout(settings.idle_timeout_secs).catch(console.warn);

  await initializeProcessMapperRuntime();

  const [trackingSnapshot, trackerHealth] = await Promise.all([
    getCurrentTrackingSnapshot(),
    loadTrackerHealthSnapshot(),
  ]);

  return {
    settings,
    activeWindow: trackingSnapshot?.window ?? null,
    trackingStatus: trackingSnapshot?.status ?? DEFAULT_TRACKING_STATUS,
    trackerHealth,
  };
}
