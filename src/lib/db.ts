import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { ProcessMapper } from './ProcessMapper';

let dbInstance: Database | null = null;
let dbInstancePromise: Promise<Database> | null = null;

export const getDB = async () => {
  try {
    if (dbInstance) {
      return dbInstance;
    }

    if (!dbInstancePromise) {
      dbInstancePromise = Database.load('sqlite:timetracker.db')
        .then((db) => {
          dbInstance = db;
          console.log("Database initialized successfully");
          return db;
        })
        .catch((error) => {
          dbInstancePromise = null;
          throw error;
        });
    }

    return await dbInstancePromise;
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
  const results = await db.select<SessionRecord[]>('SELECT * FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC, id DESC LIMIT 1');
  return results.length > 0 ? results[0] : null;
};

export const startSession = async (info: { app_name: string; exe_name: string; window_title: string; process_path: string }) => {
  const db = await getDB();
  const existingActive = await loadActiveSession().catch(() => null);
  if (
    existingActive &&
    existingActive.exe_name === info.exe_name &&
    existingActive.window_title === info.window_title
  ) {
    return;
  }

  const start_time = Date.now();
  try {
    await db.execute(
      'INSERT INTO sessions (app_name, exe_name, window_title, start_time) VALUES (?, ?, ?, ?)',
      [info.app_name, info.exe_name, info.window_title, start_time]
    );
  } catch (error) {
    const activeAfterFailure = await loadActiveSession().catch(() => null);
    if (
      activeAfterFailure &&
      activeAfterFailure.exe_name === info.exe_name &&
      activeAfterFailure.window_title === info.window_title
    ) {
      return;
    }
    throw error;
  }

  void loadIconCache(info.exe_name, info.process_path).catch((error) => {
    console.warn("Icon cache load failed:", error);
  });
};

export const endActiveSession = async (_minSessionSecs: number = 0, endTimeOverride?: number) => {
  const db = await getDB();
  const activeSessions = await db.select<Array<{ id: number; start_time: number }>>(
    'SELECT id, start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC, id DESC'
  );
  if (activeSessions.length === 0) return;

  const rawEndTime = endTimeOverride ?? Date.now();
  const activeIds = activeSessions.map((session) => session.id);
  const activeIdPlaceholders = activeIds.map(() => '?').join(', ');

  await db.execute(
    `UPDATE sessions
     SET end_time = CASE WHEN start_time > ? THEN start_time ELSE ? END,
         duration = CASE WHEN start_time > ? THEN 0 ELSE ? - start_time END
     WHERE id IN (${activeIdPlaceholders})`,
    [rawEndTime, rawEndTime, rawEndTime, rawEndTime, ...activeIds]
  );

};

export const loadIconCache = async (exeName: string, processPath: string) => {
  if (!processPath) {
    return;
  }

  const db = await getDB();
  const results = await db.select<{ exe_name: string }[]>('SELECT exe_name FROM icon_cache WHERE exe_name = $1', [exeName]);
  if (results.length === 0) {
    const base64Icon = await invoke<string | null>('get_icon', { exePath: processPath });
    if (base64Icon) {
      await db.execute('INSERT INTO icon_cache (exe_name, icon_base64, last_updated) VALUES ($1, $2, $3) ON CONFLICT(exe_name) DO UPDATE SET icon_base64 = excluded.icon_base64, last_updated = excluded.last_updated', [
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
    const sessions = await getHistoryByDate(new Date());
    const totals = new Map<string, { app_name: string; exe_name: string; total_duration: number }>();

    for (const session of sessions) {
      const key = session.exe_name.toLowerCase();
      const duration = Math.max(0, session.duration ?? 0);
      const existing = totals.get(key);

      if (existing) {
        existing.total_duration += duration;
        continue;
      }

      totals.set(key, {
        app_name: session.app_name,
        exe_name: session.exe_name,
        total_duration: duration,
      });
    }

    return Array.from(totals.values()).sort((a, b) => b.total_duration - a.total_duration);
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

export const getSessionsInRange = async (startMs: number, endMs: number): Promise<HistorySession[]> => {
  const db = await getDB();
  const now = Date.now();
  const rows = await db.select<HistorySession[]>(
    "SELECT id, app_name, exe_name, window_title, start_time, end_time, COALESCE(duration, MAX(0, ? - start_time)) as duration FROM sessions WHERE start_time < ? AND COALESCE(end_time, ?) > ? ORDER BY start_time ASC",
    [now, endMs, now, startMs]
  );

  return rows.filter((row) => ProcessMapper.shouldTrack(row.exe_name));
};

export const getHistoryByDate = async (date: Date): Promise<HistorySession[]> => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(24, 0, 0, 0);
  return getSessionsInRange(start.getTime(), end.getTime());
};

export interface DailySummary {
  date: string;
  total_duration: number;
}

export const getWeeklyStats = async (): Promise<DailySummary[]> => {
  const now = Date.now();
  const rangeEnd = now;
  const rangeStartDate = new Date(now);
  rangeStartDate.setHours(0, 0, 0, 0);
  rangeStartDate.setDate(rangeStartDate.getDate() - 6);
  const rangeStart = rangeStartDate.getTime();
  const sessions = await getSessionsInRange(rangeStart, rangeEnd);
  const totals = new Map<string, number>();

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(rangeStart);
    day.setDate(day.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    totals.set(key, 0);
  }

  for (const session of sessions) {
    const rawEnd = session.end_time ?? (session.start_time + Math.max(0, session.duration ?? 0));
    let cursor = Math.max(session.start_time, rangeStart);
    const cappedEnd = Math.min(rawEnd, rangeEnd);

    while (cursor < cappedEnd) {
      const nextDay = new Date(cursor);
      nextDay.setHours(24, 0, 0, 0);
      const segmentEnd = Math.min(cappedEnd, nextDay.getTime());
      const currentDay = new Date(cursor);
      const currentKey = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, '0')}-${String(currentDay.getDate()).padStart(2, '0')}`;
      totals.set(currentKey, (totals.get(currentKey) ?? 0) + (segmentEnd - cursor));
      cursor = segmentEnd;
    }
  }

  return Array.from(totals.entries())
    .map(([date, total_duration]) => ({ date, total_duration }))
    .sort((a, b) => a.date.localeCompare(b.date));
};
