import { getDB } from "./sqlite.ts";
import { resolveCanonicalExecutable } from "../../features/classification/services/processNormalization.ts";

export interface HistorySession {
  id: number;
  app_name: string;
  exe_name: string;
  window_title: string;
  start_time: number;
  end_time: number | null;
  duration: number | null;
}

export interface DailySummary {
  date: string;
  total_duration: number;
}

export async function getIconMap(): Promise<Record<string, string>> {
  const db = await getDB();
  const results = await db.select<{ exe_name: string; icon_base64: string }[]>(
    "SELECT exe_name, icon_base64 FROM icon_cache",
  );
  const map: Record<string, string> = {};

  for (const row of results) {
    const rawExe = (row.exe_name ?? "").trim();
    if (!rawExe) continue;

    const normalizedExe = resolveCanonicalExecutable(rawExe);
    const lowerExe = rawExe.toLowerCase();

    map[rawExe] = row.icon_base64;
    map[lowerExe] = row.icon_base64;
    map[normalizedExe] = row.icon_base64;
  }

  return map;
}

export async function getSessionsInRange(startMs: number, endMs: number): Promise<HistorySession[]> {
  const db = await getDB();
  const now = Date.now();
  return db.select<HistorySession[]>(
    "SELECT id, app_name, exe_name, window_title, start_time, end_time, COALESCE(duration, MAX(0, ? - start_time)) as duration FROM sessions WHERE start_time < ? AND COALESCE(end_time, ?) > ? ORDER BY start_time ASC",
    [now, endMs, now, startMs],
  );
}

export async function getHistoryByDate(date: Date): Promise<HistorySession[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(24, 0, 0, 0);
  return getSessionsInRange(start.getTime(), end.getTime());
}
