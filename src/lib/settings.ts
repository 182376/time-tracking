import { getDB } from './db';
import { ProcessMapper, type AppOverride } from './ProcessMapper.ts';
import { resolveCanonicalExecutable, shouldTrackProcess } from './processNormalization.ts';

export interface AppSettings {
  afk_timeout_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  afk_timeout_secs: 300,
  refresh_interval_secs: 10,
  min_session_secs: 30,
};

const TRACKER_LAST_HEARTBEAT_KEY = "__tracker_last_heartbeat_ms";
const TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY = "__tracker_last_successful_sample_ms";
const APP_OVERRIDE_KEY_PREFIX = "__app_override::";
const AFK_TIMEOUT_OPTIONS = [60, 180, 300];
const REFRESH_INTERVAL_OPTIONS = [1, 3, 5, 10];
const MIN_SESSION_OPTIONS = [30, 60, 180, 300, 600];

export interface OtherCategoryCandidate {
  exeName: string;
  appName: string;
  totalDuration: number;
  lastSeenMs: number;
}

function parseNumberSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionValue(value: string | undefined, fallback: number, allowedValues: number[]) {
  const parsed = parseNumberSetting(value, fallback);
  return allowedValues.includes(parsed) ? parsed : fallback;
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
  };
};

export const saveSetting = async (key: keyof AppSettings, value: number): Promise<void> => {
  await upsertSettingValue(key, String(value));
};

export const clearSessionsBefore = async (cutoffTime: number): Promise<void> => {
  const db = await getDB();
  await db.execute('DELETE FROM sessions WHERE start_time < ?', [cutoffTime]);
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

export const loadOtherCategoryCandidates = async (
  days: number = 30,
  limit: number = 30,
): Promise<OtherCategoryCandidate[]> => {
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

  const merged = new Map<string, OtherCategoryCandidate>();

  for (const row of rows) {
    const canonicalExe = resolveCanonicalExecutable(row.exe_name);
    if (!canonicalExe || !shouldTrackProcess(canonicalExe)) {
      continue;
    }

    const mapped = ProcessMapper.map(canonicalExe, { appName: row.app_name });
    if (mapped.category !== "other") {
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
