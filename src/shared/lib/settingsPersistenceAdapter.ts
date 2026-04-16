import {
  clearAllSessionWindowTitles,
  deleteSessionsBefore,
  loadAllSettingRows,
  loadSettingTimestamp,
  upsertSettingValue,
} from "../../platform/persistence/settingsPersistence.ts";
import {
  normalizeSettingsRecord,
  serializeSettingValue,
  type AppSettings,
} from "../settings/appSettings";

const TRACKER_LAST_HEARTBEAT_KEY = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY = "__tracker_last_successful_sample_ms";

export type { AppSettings };

export async function loadSettings(): Promise<AppSettings> {
  const rows = await loadAllSettingRows();
  const record: Record<string, string> = {};
  for (const row of rows) {
    record[row.key] = row.value;
  }
  return normalizeSettingsRecord(record);
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await upsertSettingValue(key, serializeSettingValue(value));
}

export async function clearSessionsBefore(cutoffTime: number): Promise<void> {
  await deleteSessionsBefore(cutoffTime);
}

export async function clearAllWindowTitles(): Promise<void> {
  await clearAllSessionWindowTitles();
}

export async function loadTrackerHealthTimestamp(): Promise<number | null> {
  const lastSampleMs = await loadSettingTimestamp(TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY);
  if (lastSampleMs !== null) {
    return lastSampleMs;
  }

  return loadSettingTimestamp(TRACKER_LAST_HEARTBEAT_KEY);
}

export async function saveTrackerHeartbeat(timestampMs: number): Promise<void> {
  await upsertSettingValue(TRACKER_LAST_HEARTBEAT_KEY, String(timestampMs));
}
