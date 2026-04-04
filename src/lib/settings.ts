import { getDB } from './db';

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
const AFK_TIMEOUT_OPTIONS = [60, 180, 300];
const REFRESH_INTERVAL_OPTIONS = [1, 3, 5, 10];
const MIN_SESSION_OPTIONS = [30, 60, 180, 300, 600];

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

export const loadTrackerHeartbeat = async (): Promise<number | null> => {
  return loadSettingTimestamp(TRACKER_LAST_HEARTBEAT_KEY);
};

export const loadTrackerHealthTimestamp = async (): Promise<number | null> => {
  const lastSampleMs = await loadSettingTimestamp(TRACKER_LAST_SUCCESSFUL_SAMPLE_KEY);
  if (lastSampleMs !== null) {
    return lastSampleMs;
  }

  return loadTrackerHeartbeat();
};

export const saveTrackerHeartbeat = async (timestampMs: number): Promise<void> => {
  await upsertSettingValue(TRACKER_LAST_HEARTBEAT_KEY, String(timestampMs));
};
