import { getDB } from './db';
import { ProcessMapper, type AppOverride } from './ProcessMapper.ts';
import {
  isAppCategory,
  isCustomCategory,
  type AppCategory,
  type CustomAppCategory,
} from './config/categoryTokens.ts';
import { resolveCanonicalExecutable, shouldTrackProcess } from './processNormalization.ts';

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
  afk_timeout_secs: 300,
  refresh_interval_secs: 1,
  min_session_secs: 30,
  tracking_paused: false,
  close_behavior: "tray",
  minimize_behavior: "taskbar",
  launch_at_login: false,
  start_minimized: true,
  onboarding_completed: false,
};

const TRACKER_LAST_HEARTBEAT_KEY = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY = "__tracker_last_successful_sample_ms";
const APP_OVERRIDE_KEY_PREFIX = "__app_override::";
const CATEGORY_COLOR_OVERRIDE_KEY_PREFIX = "__category_color_override::";
const CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX = "__category_default_color_assignment::";
const CUSTOM_CATEGORY_KEY_PREFIX = "__custom_category::";
const DELETED_CATEGORY_KEY_PREFIX = "__deleted_category::";
const AFK_TIMEOUT_OPTIONS = [60, 180, 300];
const REFRESH_INTERVAL_OPTIONS = [1];
const MIN_SESSION_OPTIONS = [30, 60, 180, 300, 600];
const CLOSE_BEHAVIOR_OPTIONS: CloseBehavior[] = ["exit", "tray"];
const MINIMIZE_BEHAVIOR_OPTIONS: MinimizeBehavior[] = ["taskbar", "tray"];

export interface OtherCategoryCandidate {
  exeName: string;
  appName: string;
  totalDuration: number;
  lastSeenMs: number;
}

export interface ObservedAppCandidate {
  exeName: string;
  appName: string;
  totalDuration: number;
  lastSeenMs: number;
}

type DeleteAppSessionScope = "today" | "all";

function normalizeHexColor(colorValue: string | undefined): string | null {
  const raw = (colorValue ?? "").trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null;
  }
  return normalized.toUpperCase();
}

function parseNumberSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionValue(value: string | undefined, fallback: number, allowedValues: number[]) {
  const parsed = parseNumberSetting(value, fallback);
  return allowedValues.includes(parsed) ? parsed : fallback;
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
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

async function loadSettingTimestamp(key: string): Promise<number | null> {
  const db = await getDB();
  const rows = await db.select<{ value: string }[]>(
    'SELECT value FROM settings WHERE key = ? LIMIT 1',
    [key],
  );

  if (rows.length === 0) {
    return null;
  }

  const parsed = Number(rows[0].value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const loadSettings = async (): Promise<AppSettings> => {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM settings'
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    afk_timeout_secs: normalizeOptionValue(map.afk_timeout_secs, DEFAULT_SETTINGS.afk_timeout_secs, AFK_TIMEOUT_OPTIONS),
    refresh_interval_secs: normalizeOptionValue(map.refresh_interval_secs, DEFAULT_SETTINGS.refresh_interval_secs, REFRESH_INTERVAL_OPTIONS),
    min_session_secs: normalizeOptionValue(map.min_session_secs, DEFAULT_SETTINGS.min_session_secs, MIN_SESSION_OPTIONS),
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
};

export const saveSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> => {
  await upsertSettingValue(key, serializeSettingValue(value));
};

export const clearSessionsBefore = async (cutoffTime: number): Promise<void> => {
  const db = await getDB();
  await db.execute('DELETE FROM sessions WHERE start_time < ?', [cutoffTime]);
};

export const clearAllWindowTitles = async (): Promise<void> => {
  const db = await getDB();
  await db.execute(
    "UPDATE sessions SET window_title = '' WHERE COALESCE(window_title, '') <> ''",
  );
};

export const loadTrackerHealthTimestamp = async (): Promise<number | null> => {
  const lastSampleMs = await loadSettingTimestamp(TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY);
  if (lastSampleMs !== null) {
    return lastSampleMs;
  }

  return loadSettingTimestamp(TRACKER_LAST_HEARTBEAT_KEY);
};

export const saveTrackerHeartbeat = async (timestampMs: number): Promise<void> => {
  await upsertSettingValue(TRACKER_LAST_HEARTBEAT_KEY, String(timestampMs));
};

export const loadAppOverrides = async (): Promise<Record<string, AppOverride>> => {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM settings WHERE key LIKE ?',
    [`${APP_OVERRIDE_KEY_PREFIX}%`],
  );

  const overrides: Record<string, AppOverride> = {};
  for (const row of rows) {
    const canonicalExe = resolveCanonicalExecutable(row.key.slice(APP_OVERRIDE_KEY_PREFIX.length));
    if (!canonicalExe) continue;

    const parsed = ProcessMapper.fromOverrideStorageValue(row.value);
    if (!parsed) continue;
    overrides[canonicalExe] = parsed;
  }

  return overrides;
};

export const saveAppOverride = async (exeName: string, override: AppOverride | null): Promise<void> => {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  if (!canonicalExe) {
    return;
  }

  const key = `${APP_OVERRIDE_KEY_PREFIX}${canonicalExe}`;
  const db = await getDB();

  if (!override || override.enabled === false) {
    await db.execute('DELETE FROM settings WHERE key = ?', [key]);
    return;
  }

  await upsertSettingValue(key, ProcessMapper.toOverrideStorageValue(override));
};

export const clearAllAppOverrides = async (): Promise<void> => {
  const db = await getDB();
  await db.execute('DELETE FROM settings WHERE key LIKE ?', [`${APP_OVERRIDE_KEY_PREFIX}%`]);
};

export const loadCategoryColorOverrides = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM settings WHERE key LIKE ?',
    [`${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}%`],
  );

  const overrides: Record<string, string> = {};
  for (const row of rows) {
    const category = row.key.slice(CATEGORY_COLOR_OVERRIDE_KEY_PREFIX.length);
    if (!isAppCategory(category)) {
      continue;
    }
    const color = normalizeHexColor(row.value);
    if (!color) {
      continue;
    }
    overrides[category] = color;
  }

  return overrides;
};

export const saveCategoryColorOverride = async (
  category: AppCategory,
  colorValue: string | null,
): Promise<void> => {
  const key = `${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}${category}`;
  const db = await getDB();
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await db.execute('DELETE FROM settings WHERE key = ?', [key]);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
};

export const clearAllCategoryColorOverrides = async (): Promise<void> => {
  const db = await getDB();
  await db.execute('DELETE FROM settings WHERE key LIKE ?', [`${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}%`]);
};

export const loadCategoryDefaultColorAssignments = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings WHERE key LIKE ?",
    [`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}%`],
  );

  const assignments: Record<string, string> = {};
  for (const row of rows) {
    const category = row.key.slice(CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX.length);
    if (!isAppCategory(category)) {
      continue;
    }
    const color = normalizeHexColor(row.value);
    if (!color) {
      continue;
    }
    assignments[category] = color;
  }

  return assignments;
};

export const saveCategoryDefaultColorAssignment = async (
  category: AppCategory,
  colorValue: string | null,
): Promise<void> => {
  const key = `${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`;
  const db = await getDB();
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
};

export const loadCustomCategories = async (): Promise<CustomAppCategory[]> => {
  const db = await getDB();
  const rows = await db.select<{ key: string }[]>(
    'SELECT key FROM settings WHERE key LIKE ?',
    [`${CUSTOM_CATEGORY_KEY_PREFIX}%`],
  );

  const categories = new Set<CustomAppCategory>();
  for (const row of rows) {
    const category = row.key.slice(CUSTOM_CATEGORY_KEY_PREFIX.length);
    if (!isCustomCategory(category)) {
      continue;
    }
    categories.add(category);
  }

  return Array.from(categories);
};

export const saveCustomCategory = async (category: CustomAppCategory): Promise<void> => {
  const key = `${CUSTOM_CATEGORY_KEY_PREFIX}${category}`;
  await upsertSettingValue(key, String(Date.now()));
};

export const deleteCustomCategory = async (category: CustomAppCategory): Promise<void> => {
  const db = await getDB();
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CUSTOM_CATEGORY_KEY_PREFIX}${category}`]);
  await db.execute("DELETE FROM settings WHERE key = ?", [`${DELETED_CATEGORY_KEY_PREFIX}${category}`]);
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`]);
};

export const loadDeletedCategories = async (): Promise<AppCategory[]> => {
  const db = await getDB();
  const rows = await db.select<{ key: string }[]>(
    "SELECT key FROM settings WHERE key LIKE ?",
    [`${DELETED_CATEGORY_KEY_PREFIX}%`],
  );

  const categories = new Set<AppCategory>();
  for (const row of rows) {
    const category = row.key.slice(DELETED_CATEGORY_KEY_PREFIX.length);
    if (!isAppCategory(category)) {
      continue;
    }
    categories.add(category);
  }

  return Array.from(categories);
};

export const saveDeletedCategory = async (category: AppCategory, deleted: boolean): Promise<void> => {
  const key = `${DELETED_CATEGORY_KEY_PREFIX}${category}`;
  const db = await getDB();
  if (!deleted) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }
  await upsertSettingValue(key, String(Date.now()));
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`]);
};

export const loadOtherCategoryCandidates = async (
  days: number = 30,
  limit: number = 30,
): Promise<OtherCategoryCandidate[]> => {
  const observed = await loadObservedAppCandidates(days, Math.max(limit, 1) * 2);
  const otherOnly = observed.filter((item) => (
    ProcessMapper.map(item.exeName, { appName: item.appName }).category === "other"
  ));
  return otherOnly.slice(0, Math.max(1, limit));
};

export const loadObservedAppCandidates = async (
  days: number = 30,
  limit: number = 120,
): Promise<ObservedAppCandidate[]> => {
  const db = await getDB();
  const sinceMs = Date.now() - (Math.max(1, days) * 24 * 60 * 60 * 1000);
  const nowMs = Date.now();
  const rows = await db.select<Array<{
    exe_name: string;
    app_name: string;
    total_duration: number;
    last_seen_ms: number;
  }>>(
    `SELECT exe_name,
            MAX(COALESCE(app_name, '')) AS app_name,
            SUM(COALESCE(duration, MAX(0, ? - start_time))) AS total_duration,
            MAX(start_time) AS last_seen_ms
     FROM sessions
     WHERE start_time >= ?
     GROUP BY exe_name`,
    [nowMs, sinceMs],
  );

  const merged = new Map<string, ObservedAppCandidate>();

  for (const row of rows) {
    const canonicalExe = resolveCanonicalExecutable(row.exe_name);
    if (!canonicalExe || !shouldTrackProcess(canonicalExe)) {
      continue;
    }

    const mapped = ProcessMapper.map(canonicalExe, { appName: row.app_name });
    if (mapped.category === "system") {
      continue;
    }
    const previous = merged.get(canonicalExe);
    const duration = Math.max(0, Number(row.total_duration ?? 0));
    const lastSeenMs = Math.max(0, Number(row.last_seen_ms ?? 0));
    const appName = row.app_name?.trim() || mapped.name;

    if (!previous) {
      merged.set(canonicalExe, {
        exeName: canonicalExe,
        appName,
        totalDuration: duration,
        lastSeenMs,
      });
      continue;
    }

    previous.totalDuration += duration;
    previous.lastSeenMs = Math.max(previous.lastSeenMs, lastSeenMs);
    if (!previous.appName && appName) {
      previous.appName = appName;
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.lastSeenMs - a.lastSeenMs || b.totalDuration - a.totalDuration)
    .slice(0, Math.max(1, limit));
};

export const deleteObservedAppSessions = async (
  exeName: string,
  scope: DeleteAppSessionScope = "all",
): Promise<number> => {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  if (!canonicalExe) {
    return 0;
  }

  const db = await getDB();
  const rows = await db.select<Array<{ exe_name: string }>>(
    "SELECT DISTINCT exe_name FROM sessions",
  );
  const matchedExeNames = rows
    .map((row) => row.exe_name)
    .filter((rawExeName) => resolveCanonicalExecutable(rawExeName) === canonicalExe);

  if (matchedExeNames.length === 0) {
    return 0;
  }

  const placeholders = matchedExeNames.map(() => "?").join(", ");
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (scope === "all") {
    await db.execute(
      `DELETE FROM sessions WHERE exe_name IN (${placeholders})`,
      matchedExeNames,
    );
    return matchedExeNames.length;
  }

  await db.execute(
    `DELETE FROM sessions
     WHERE exe_name IN (${placeholders})
       AND start_time >= ?
       AND start_time < ?`,
    [...matchedExeNames, dayStart.getTime(), dayEnd.getTime()],
  );

  return matchedExeNames.length;
};
