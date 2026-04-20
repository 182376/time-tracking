import {
  loadAppSettings,
  loadTrackerHealthTimestamp,
  saveAppSetting,
  type AppSettings,
} from "../../platform/persistence/appSettingsStore.ts";

export type { AppSettings };

export async function loadCurrentAppSettings(): Promise<AppSettings> {
  return loadAppSettings();
}

export async function loadLatestTrackingPauseSetting(): Promise<boolean> {
  const settings = await loadCurrentAppSettings();
  return settings.tracking_paused;
}

export async function loadTrackerHealthTimestampMs(): Promise<number | null> {
  return loadTrackerHealthTimestamp();
}

export async function saveMinSessionSecsSetting(nextValue: number): Promise<void> {
  await saveAppSetting("min_session_secs", nextValue);
}
