import Database from '@tauri-apps/plugin-sql';
import { ProcessMapper } from './ProcessMapper.ts';
import { resolveCanonicalExecutable, shouldTrackProcess } from './processNormalization.ts';

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

export const getIconMap = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  const results = await db.select<{ exe_name: string; icon_base64: string }[]>('SELECT exe_name, icon_base64 FROM icon_cache');
  const map: Record<string, string> = {};
  for (const r of results) {
    const rawExe = (r.exe_name ?? "").trim();
    if (!rawExe) continue;

    const normalizedExe = resolveCanonicalExecutable(rawExe);
    const lowerExe = rawExe.toLowerCase();

    map[rawExe] = r.icon_base64;
    map[lowerExe] = r.icon_base64;
    map[normalizedExe] = r.icon_base64;
  }
  return map;
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

  return rows.filter((row) => {
    const canonicalExe = resolveCanonicalExecutable(row.exe_name);
    return shouldTrackProcess(canonicalExe) && ProcessMapper.shouldTrack(canonicalExe);
  });
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
