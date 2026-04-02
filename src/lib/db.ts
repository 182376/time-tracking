import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { ProcessMapper } from './ProcessMapper';

let dbInstance: Database | null = null;

export const getDB = async () => {
  try {
    if (!dbInstance) {
      dbInstance = await Database.load('sqlite:timetracker.db');
      console.log("Database initialized successfully");
    }
    return dbInstance;
  } catch (e) {
    console.error("Database Load Error:", e);
    throw new Error("DB_INIT_FAILED: " + (e instanceof Error ? e.message : String(e)));
  }
};

export interface SessionRecord {
  id?: number;
  app_name: string;
  exe_name: string;
  window_title: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
}

export const loadActiveSession = async (): Promise<SessionRecord | null> => {
  const db = await getDB();
  const results = await db.select<SessionRecord[]>('SELECT * FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1');
  return results.length > 0 ? results[0] : null;
};

export const startSession = async (info: { app_name: string; exe_name: string; window_title: string; process_path: string }) => {
  const db = await getDB();
  const start_time = Date.now();
  await db.execute(
    'INSERT INTO sessions (app_name, exe_name, window_title, start_time) VALUES (?, ?, ?, ?)',
    [info.app_name, info.exe_name, info.window_title, start_time]
  );
  loadIconCache(info.exe_name, info.process_path);
};

export const endActiveSession = async (minSessionSecs: number = 0, endTimeOverride?: number) => {
  const db = await getDB();
  const activeSession = await loadActiveSession();
  if (!activeSession) return;

  const rawEndTime = endTimeOverride ?? Date.now();
  const end_time = Math.max(activeSession.start_time, rawEndTime);

  await db.execute(
    'UPDATE sessions SET end_time = ?, duration = ? - start_time WHERE id = ?',
    [end_time, end_time, activeSession.id]
  );

  if (minSessionSecs > 0) {
    await db.execute(
      'DELETE FROM sessions WHERE duration < ? AND duration IS NOT NULL',
      [minSessionSecs * 1000]
    );
  }
};

export const loadIconCache = async (exeName: string, processPath: string) => {
  const db = await getDB();
  const results = await db.select<{ exe_name: string }[]>('SELECT exe_name FROM icon_cache WHERE exe_name = $1', [exeName]);
  if (results.length === 0) {
    const base64Icon = await invoke<string | null>('get_icon', { exePath: processPath });
    if (base64Icon) {
      await db.execute('INSERT INTO icon_cache (exe_name, icon_base64, last_updated) VALUES ($1, $2, $3)', [
        exeName, base64Icon, Date.now()
      ]);
    }
  }
};

export const getIconMap = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  const results = await db.select<{ exe_name: string; icon_base64: string }[]>('SELECT exe_name, icon_base64 FROM icon_cache');
  const map: Record<string, string> = {};
  for (const r of results) {
    map[r.exe_name] = r.icon_base64;
  }
  return map;
};

export const getDailyStats = async () => {
  try {
    const db = await getDB();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const ts = startOfToday.getTime();

    const rows = await db.select<any[]>(
      "SELECT app_name, exe_name, SUM(COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time)) as total_duration FROM sessions WHERE start_time >= ? GROUP BY exe_name ORDER BY total_duration DESC",
      [ts]
    );

    return rows.filter((row) => ProcessMapper.shouldTrack(row.exe_name));
  } catch (e) {
    console.error("Query stats failed:", e);
    throw e;
  }
};

export interface HistorySession {
  id: number;
  app_name: string;
  exe_name: string;
  window_title: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
}

export const getHistoryByDate = async (date: Date): Promise<HistorySession[]> => {
  const db = await getDB();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const rows = await db.select<HistorySession[]>(
    "SELECT id, app_name, exe_name, window_title, start_time, end_time, COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time) as duration FROM sessions WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC",
    [start.getTime(), end.getTime()]
  );

  return rows.filter((row) => ProcessMapper.shouldTrack(row.exe_name));
};

export interface DailySummary {
  date: string;
  total_duration: number;
}

export const getWeeklyStats = async (): Promise<DailySummary[]> => {
  const db = await getDB();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await db.select<Array<{ exe_name: string; start_time: number; duration: number }>>(
    "SELECT exe_name, start_time, COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time) as duration FROM sessions WHERE start_time >= ? ORDER BY start_time ASC",
    [sevenDaysAgo]
  );

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!ProcessMapper.shouldTrack(row.exe_name)) continue;

    const date = new Date(row.start_time);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    totals.set(key, (totals.get(key) ?? 0) + row.duration);
  }

  return Array.from(totals.entries())
    .map(([date, total_duration]) => ({ date, total_duration }))
    .sort((a, b) => a.date.localeCompare(b.date));
};
