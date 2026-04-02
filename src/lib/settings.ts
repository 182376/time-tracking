import { getDB } from './db';

export interface AppSettings {
  afk_timeout_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  afk_timeout_secs: 300,
  refresh_interval_secs: 10,
  min_session_secs: 5,
};

export const loadSettings = async (): Promise<AppSettings> => {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM settings'
  );
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    afk_timeout_secs: map.afk_timeout_secs
      ? Number(map.afk_timeout_secs)
      : DEFAULT_SETTINGS.afk_timeout_secs,
    refresh_interval_secs: map.refresh_interval_secs
      ? Number(map.refresh_interval_secs)
      : DEFAULT_SETTINGS.refresh_interval_secs,
    min_session_secs: map.min_session_secs
      ? Number(map.min_session_secs)
      : DEFAULT_SETTINGS.min_session_secs,
  };
};

export const saveSetting = async (key: keyof AppSettings, value: number): Promise<void> => {
  const db = await getDB();
  await db.execute(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
};

export const clearSessionsBefore = async (cutoffTime: number): Promise<void> => {
  const db = await getDB();
  await db.execute('DELETE FROM sessions WHERE start_time < ?', [cutoffTime]);
};
