import {
  clearAllSessionWindowTitles,
  deleteSessionsBefore,
  loadAllSettingRows,
  loadSettingTimestamp,
} from "./settingsPersistence.ts";
import { executeWriteBatch, type SqlWriteOperation } from "./sqlite.ts";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type CloseBehavior,
  type MinimizeBehavior,
} from "../../shared/settings/appSettings.ts";

const TRACKER_LAST_HEARTBEAT_KEY = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY = "__tracker_last_successful_sample_ms";

export type { AppSettings };
export type AppSettingsPatch = Partial<AppSettings>;
type PersistedSettingValue = string | number | boolean;

type RawAppSettingsKey =
  | "idle_timeout_secs"
  | "timeline_merge_gap_secs"
  | "refresh_interval_secs"
  | "min_session_secs"
  | "tracking_paused"
  | "close_behavior"
  | "minimize_behavior"
  | "launch_at_login"
  | "start_minimized"
  | "onboarding_completed";

const APP_SETTINGS_RAW_KEYS: Record<keyof AppSettings, RawAppSettingsKey> = {
  idleTimeoutSecs: "idle_timeout_secs",
  timelineMergeGapSecs: "timeline_merge_gap_secs",
  refreshIntervalSecs: "refresh_interval_secs",
  minSessionSecs: "min_session_secs",
  trackingPaused: "tracking_paused",
  closeBehavior: "close_behavior",
  minimizeBehavior: "minimize_behavior",
  launchAtLogin: "launch_at_login",
  startMinimized: "start_minimized",
  onboardingCompleted: "onboarding_completed",
};

const IDLE_TIMEOUT_SECONDS_RANGE = { min: 300, max: 1800, step: 60 } as const;
const TIMELINE_MERGE_GAP_SECONDS_RANGE = { min: 60, max: 300, step: 60 } as const;
const REFRESH_INTERVAL_OPTIONS = [1, 3];
const MIN_SESSION_SECONDS_RANGE = { min: 60, max: 600, step: 60 } as const;
const CLOSE_BEHAVIOR_OPTIONS: CloseBehavior[] = ["exit", "tray"];
const MINIMIZE_BEHAVIOR_OPTIONS: MinimizeBehavior[] = ["taskbar", "widget"];

function parseNumberSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionValue(value: string | undefined, fallback: number, allowedValues: number[]) {
  const parsed = parseNumberSetting(value, fallback);
  return allowedValues.includes(parsed) ? parsed : fallback;
}

function normalizeRangeStepValue(
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number; step: number },
) {
  const parsed = parseNumberSetting(value, fallback);
  const clamped = Math.min(range.max, Math.max(range.min, parsed));
  return Math.round(clamped / range.step) * range.step;
}

function parseBooleanSetting(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeEnumOption<T extends string>(
  value: string | undefined,
  fallback: T,
  allowedValues: readonly T[],
) {
  if (!value) return fallback;
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

function serializeSettingValue(value: PersistedSettingValue) {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

export function normalizeSettingsRecord(record: Record<string, string | undefined>): AppSettings {
  return {
    idleTimeoutSecs: normalizeRangeStepValue(
      record.idle_timeout_secs,
      DEFAULT_SETTINGS.idleTimeoutSecs,
      IDLE_TIMEOUT_SECONDS_RANGE,
    ),
    timelineMergeGapSecs: normalizeRangeStepValue(
      record.timeline_merge_gap_secs,
      DEFAULT_SETTINGS.timelineMergeGapSecs,
      TIMELINE_MERGE_GAP_SECONDS_RANGE,
    ),
    refreshIntervalSecs: normalizeOptionValue(
      record.refresh_interval_secs,
      DEFAULT_SETTINGS.refreshIntervalSecs,
      REFRESH_INTERVAL_OPTIONS,
    ),
    minSessionSecs: normalizeRangeStepValue(
      record.min_session_secs,
      DEFAULT_SETTINGS.minSessionSecs,
      MIN_SESSION_SECONDS_RANGE,
    ),
    trackingPaused: parseBooleanSetting(record.tracking_paused, DEFAULT_SETTINGS.trackingPaused),
    closeBehavior: normalizeEnumOption(
      record.close_behavior,
      DEFAULT_SETTINGS.closeBehavior,
      CLOSE_BEHAVIOR_OPTIONS,
    ),
    minimizeBehavior: normalizeEnumOption(
      record.minimize_behavior,
      DEFAULT_SETTINGS.minimizeBehavior,
      MINIMIZE_BEHAVIOR_OPTIONS,
    ),
    launchAtLogin: parseBooleanSetting(record.launch_at_login, DEFAULT_SETTINGS.launchAtLogin),
    startMinimized: parseBooleanSetting(record.start_minimized, DEFAULT_SETTINGS.startMinimized),
    onboardingCompleted: parseBooleanSetting(
      record.onboarding_completed,
      DEFAULT_SETTINGS.onboardingCompleted,
    ),
  };
}

export function buildRawAppSettingsPatch(patch: AppSettingsPatch): Record<string, PersistedSettingValue> {
  const rawPatch: Record<string, PersistedSettingValue> = {};
  const entries = Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>;
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    rawPatch[APP_SETTINGS_RAW_KEYS[key]] = value;
  }
  return rawPatch;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const rows = await loadAllSettingRows();
  const record: Record<string, string> = {};
  for (const row of rows) {
    record[row.key] = row.value;
  }
  return normalizeSettingsRecord(record);
}

export async function saveAppSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await saveAppSettingsPatch({
    [key]: value,
  } as AppSettingsPatch);
}

export async function saveAppSettingsPatch(patch: AppSettingsPatch): Promise<void> {
  await saveSettingEntries(buildRawAppSettingsPatch(patch));
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
  await saveSettingEntries({
    [TRACKER_LAST_HEARTBEAT_KEY]: timestampMs,
  });
}

async function saveSettingEntries(
  patch: Record<string, PersistedSettingValue>,
): Promise<void> {
  const operations = buildSaveSettingEntryOperations(patch);
  await executeWriteBatch(operations);
}

export function buildSaveSettingEntryOperations(
  patch: Record<string, PersistedSettingValue>,
): SqlWriteOperation[] {
  const operations: SqlWriteOperation[] = [];
  for (const [key, value] of Object.entries(patch)) {
    operations.push({
      query: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      values: [key, serializeSettingValue(value)],
    });
  }
  return operations;
}
