import type { AppSettings } from "../../lib/settings";
import { SettingsService } from "../../lib/services/SettingsService";
import { TrackingService } from "../../lib/services/TrackingService";
import type { TrackerHealthSnapshot, TrackingWindowSnapshot } from "../../types/tracking";
import { resolveTrackerHealth } from "../../types/tracking";
import { initializeProcessMapperRuntime } from "./processMapperRuntimeService";

export const TRACKER_HEARTBEAT_STALE_AFTER_MS = 8_000;

export interface AppRuntimeBootstrapSnapshot {
  settings: AppSettings;
  activeWindow: TrackingWindowSnapshot | null;
  trackerHealth: TrackerHealthSnapshot;
}

export async function loadTrackerHealthSnapshot(nowMs: number = Date.now()): Promise<TrackerHealthSnapshot> {
  try {
    const lastHeartbeatMs = await SettingsService.loadTrackerHealthTimestamp();
    return resolveTrackerHealth(lastHeartbeatMs, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  } catch (error) {
    console.warn("Failed to load tracker heartbeat", error);
    return resolveTrackerHealth(null, nowMs, TRACKER_HEARTBEAT_STALE_AFTER_MS);
  }
}

export async function loadAppRuntimeBootstrapSnapshot(): Promise<AppRuntimeBootstrapSnapshot> {
  const settings = await SettingsService.load();
  await TrackingService.setAfkTimeout(settings.afk_timeout_secs).catch(console.warn);

  await initializeProcessMapperRuntime();

  const [activeWindow, trackerHealth] = await Promise.all([
    TrackingService.getCurrentWindow(),
    loadTrackerHealthSnapshot(),
  ]);

  return {
    settings,
    activeWindow,
    trackerHealth,
  };
}
