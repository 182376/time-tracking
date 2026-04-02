import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

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
  // ensure icon is extracted and cached
  loadIconCache(info.exe_name, info.process_path); // kick off async
};

export const endActiveSession = async (minSessionSecs: number = 0) => {
  const db = await getDB();
  const end_time = Date.now();
  
  // Update the open session
  await db.execute(
    'UPDATE sessions SET end_time = ?, duration = ? - start_time WHERE end_time IS NULL',
    [end_time, end_time]
  );

  // Delete sessions that ended up being too short
  if (minSessionSecs > 0) {
    await db.execute(
      'DELETE FROM sessions WHERE duration < ? AND duration IS NOT NULL',
      [minSessionSecs * 1000]
    );
  }
};

// Caches the icon into the database
export const loadIconCache = async (exeName: string, processPath: string) => {
  const db = await getDB();
  const results = await db.select<{exe_name: string}[]>('SELECT exe_name FROM icon_cache WHERE exe_name = $1', [exeName]);
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
  const results = await db.select<{exe_name: string, icon_base64: string}[]>('SELECT exe_name, icon_base64 FROM icon_cache');
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

        // 使用 unixepoch 替代外部传入现在时间，避免数据抖动
        return await db.select<any[]>(
            "SELECT app_name, exe_name, SUM(COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time)) as total_duration FROM sessions WHERE start_time >= ? GROUP BY exe_name ORDER BY total_duration DESC",
            [ts]
        );
    } catch (e) {
        console.error("Query stats failed:", e);
        throw e;
    }
}

export interface HistorySession {
  id: number;
  app_name: string;
  exe_name: string;
  window_title: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
}

/** 获取指定日期的所有 session 列表（降序） */
export const getHistoryByDate = async (date: Date): Promise<HistorySession[]> => {
  const db = await getDB();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return await db.select<HistorySession[]>(
    "SELECT id, app_name, exe_name, window_title, start_time, end_time, COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time) as duration FROM sessions WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC",
    [start.getTime(), end.getTime()]
  );
};

export interface DailySummary {
  date: string;       // "YYYY-MM-DD"
  total_duration: number;
}

/** 最近 7 天的每日时长汇总（用于折线图） */
export const getWeeklyStats = async (): Promise<DailySummary[]> => {
  const db = await getDB();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return await db.select<DailySummary[]>(
    "SELECT strftime('%Y-%m-%d', datetime(start_time / 1000, 'unixepoch', 'localtime')) as date, SUM(COALESCE(duration, CAST(unixepoch('now') * 1000 AS INTEGER) - start_time)) as total_duration FROM sessions WHERE start_time >= ? GROUP BY date ORDER BY date ASC",
    [sevenDaysAgo]
  );
};

