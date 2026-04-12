import { getDB } from "./db";
import { RELEASE_DEFAULT_SETTINGS } from "./config/releaseDefaultProfile.ts";

export type CloseBehavior = "exit" | "tray";
export type MinimizeBehavior = "taskbar" | "tray";

export interface AppSettings {
  afk_timeout_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
  tracking_paused: boolean;
  close_behavior: CloseBehavior;
  minimize_behavior: MinimizeBehavior;
  launch_at_login: boolean;
  start_minimized: boolean;
  onboarding_completed: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ...RELEASE_DEFAULT_SETTINGS,
};

const TRACKER_LAST_HEARTBEAT_KEY = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY = "__tracker_last_successful_sample_ms";
const AFK_TIMEOUT_SECONDS_RANGE = { min: 60, max: 1800, step: 60 } as const;
const REFRESH_INTERVAL_OPTIONS = [1, 3];
const MIN_SESSION_SECONDS_RANGE = { min: 60, max: 600, step: 60 } as const;
const CLOSE_BEHAVIOR_OPTIONS: CloseBehavior[] = ["exit", "tray"];
const MINIMIZE_BEHAVIOR_OPTIONS: MinimizeBehavior[] = ["taskbar", "tray"];

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

function serializeSettingValue(value: AppSettings[keyof AppSettings]) {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

async function upsertSettingValue(key: string, value: string) {
  const db = await getDB();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

async function loadSettingTimestamp(key: string): Promise<number | null> {
  const db = await getDB();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = ? LIMIT 1",
    [key],
  );

  if (rows.length === 0) {
    return null;
  }

  const parsed = Number(rows[0].value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    afk_timeout_secs: normalizeRangeStepValue(
      map.afk_timeout_secs,
      DEFAULT_SETTINGS.afk_timeout_secs,
      AFK_TIMEOUT_SECONDS_RANGE,
    ),
    refresh_interval_secs: normalizeOptionValue(map.refresh_interval_secs, DEFAULT_SETTINGS.refresh_interval_secs, REFRESH_INTERVAL_OPTIONS),
    min_session_secs: normalizeRangeStepValue(
      map.min_session_secs,
      DEFAULT_SETTINGS.min_session_secs,
      MIN_SESSION_SECONDS_RANGE,
    ),
    tracking_paused: parseBooleanSetting(map.tracking_paused, DEFAULT_SETTINGS.tracking_paused),
    close_behavior: normalizeEnumOption(map.close_behavior, DEFAULT_SETTINGS.close_behavior, CLOSE_BEHAVIOR_OPTIONS),
    minimize_behavior: normalizeEnumOption(
      map.minimize_behavior,
      DEFAULT_SETTINGS.minimize_behavior,
      MINIMIZE_BEHAVIOR_OPTIONS,
    ),
    launch_at_login: parseBooleanSetting(map.launch_at_login, DEFAULT_SETTINGS.launch_at_login),
    start_minimized: parseBooleanSetting(map.start_minimized, DEFAULT_SETTINGS.start_minimized),
    onboarding_completed: parseBooleanSetting(
      map.onboarding_completed,
      DEFAULT_SETTINGS.onboarding_completed,
    ),
  };
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  await upsertSettingValue(key, serializeSettingValue(value));
}

export async function clearSessionsBefore(cutoffTime: number): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM sessions WHERE start_time < ?", [cutoffTime]);
}

export async function clearAllWindowTitles(): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE sessions SET window_title = '' WHERE COALESCE(window_title, '') <> ''",
  );
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
