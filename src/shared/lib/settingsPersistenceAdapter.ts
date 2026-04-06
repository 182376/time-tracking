import {
  clearSessionsBefore as clearSessionsBeforeInStore,
  loadSettings as loadSettingsFromStore,
  loadTrackerHealthTimestamp as loadTrackerHealthTimestampFromStore,
  saveSetting as saveSettingToStore,
  type AppSettings,
} from "../../lib/settings-store";

export type { AppSettings };

export async function loadSettings(): Promise<AppSettings> {
  return loadSettingsFromStore();
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await saveSettingToStore(key, value);
}

export async function clearSessionsBefore(cutoffTime: number): Promise<void> {
  await clearSessionsBeforeInStore(cutoffTime);
}

export async function loadTrackerHealthTimestamp(): Promise<number | null> {
  return loadTrackerHealthTimestampFromStore();
}
