import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { ProcessMapper } from './ProcessMapper';
import {
  buildRawPowerQueueEntry,
  buildRawTrackingQueueEntries,
  type RawEventQueueEntry,
  type RawPowerEvent,
} from './rawEvents';
import {
  compileDerivedSessions,
  type DerivedSessionRecord,
  type RawPowerEventRecord,
  type RawPresenceEventRecord,
  type RawWindowEventRecord,
} from './services/sessionCompiler';
import { compareDaySessions } from './services/sessionDiff';
import { planSessionFinalization } from './services/trackingLifecycle';
import type { TrackedWindow } from './services/trackingLifecycle';

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

interface RawEventQueueRow {
  id: number;
  event_kind: "window" | "presence" | "power";
  timestamp_ms: number;
  source: string;
  dedupe_key: string;
  payload_json: string;
}

export interface StoredDerivedSession extends DerivedSessionRecord {
  id: number;
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

export const endActiveSession = async (minSessionSecs: number = 0, endTimeOverride?: number) => {
  const db = await getDB();
  const activeSessions = await db.select<Array<{ id: number; start_time: number }>>(
    'SELECT id, start_time FROM sessions WHERE end_time IS NULL ORDER BY start_time DESC, id DESC'
  );
  if (activeSessions.length === 0) return;

  const rawEndTime = endTimeOverride ?? Date.now();
  const activeIds = activeSessions.map((session) => session.id);
  const activeIdPlaceholders = activeIds.map(() => '?').join(', ');
  const { idsToDelete } = planSessionFinalization(activeSessions, rawEndTime, minSessionSecs);

  await db.execute(
    `UPDATE sessions
     SET end_time = CASE WHEN start_time > ? THEN start_time ELSE ? END,
         duration = CASE WHEN start_time > ? THEN 0 ELSE ? - start_time END
     WHERE id IN (${activeIdPlaceholders})`,
    [rawEndTime, rawEndTime, rawEndTime, rawEndTime, ...activeIds]
  );

  if (idsToDelete.length > 0) {
    const deletePlaceholders = idsToDelete.map(() => '?').join(', ');
    await db.execute(
      `DELETE FROM sessions WHERE id IN (${deletePlaceholders})`,
      idsToDelete
    );
  }
};

const enqueueRawEventEntries = async (entries: RawEventQueueEntry[]) => {
  const db = await getDB();

  for (const entry of entries) {
    await db.execute(
      'INSERT OR IGNORE INTO raw_event_queue (event_kind, timestamp_ms, source, dedupe_key, payload_json, enqueued_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [
        entry.event_kind,
        entry.timestamp_ms,
        entry.source,
        entry.dedupe_key,
        entry.payload_json,
        Date.now(),
      ]
    );
  }
};

const applyQueuedRawEvent = async (db: Database, row: RawEventQueueRow) => {
  const payload = JSON.parse(row.payload_json) as Record<string, string | number>;

  if (row.event_kind === "window") {
    await db.execute(
      'INSERT OR IGNORE INTO raw_window_events (timestamp_ms, exe_name, window_title, process_path, source, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)',
      [
        Number(payload.timestamp_ms),
        String(payload.exe_name ?? ""),
        String(payload.window_title ?? ""),
        String(payload.process_path ?? ""),
        String(payload.source ?? row.source),
        row.dedupe_key,
      ]
    );
    return;
  }

  if (row.event_kind === "presence") {
    await db.execute(
      'INSERT OR IGNORE INTO raw_presence_events (timestamp_ms, state, idle_time_ms, source, dedupe_key) VALUES (?, ?, ?, ?, ?)',
      [
        Number(payload.timestamp_ms),
        String(payload.state ?? "idle"),
        Number(payload.idle_time_ms ?? 0),
        String(payload.source ?? row.source),
        row.dedupe_key,
      ]
    );
    return;
  }

  await db.execute(
    'INSERT OR IGNORE INTO raw_power_events (timestamp_ms, state, source, dedupe_key) VALUES (?, ?, ?, ?)',
    [
      Number(payload.timestamp_ms),
      String(payload.state ?? "startup"),
      String(payload.source ?? row.source),
      row.dedupe_key,
    ]
  );
};

export const flushRawEventQueue = async (limit: number = 500) => {
  const db = await getDB();
  const rows = await db.select<RawEventQueueRow[]>(
    'SELECT id, event_kind, timestamp_ms, source, dedupe_key, payload_json FROM raw_event_queue ORDER BY id ASC LIMIT ?',
    [limit]
  );

  for (const row of rows) {
    await applyQueuedRawEvent(db, row);
    await db.execute('DELETE FROM raw_event_queue WHERE id = ?', [row.id]);
  }

  return rows.length;
};

export const rebuildDerivedSessions = async (minSessionSecs: number, nowMs: number = Date.now()) => {
  const db = await getDB();
  const [rawWindowEvents, rawPresenceEvents, rawPowerEvents] = await Promise.all([
    db.select<RawWindowEventRecord[]>(
      'SELECT id, timestamp_ms, exe_name, window_title, process_path, source FROM raw_window_events ORDER BY timestamp_ms ASC, id ASC'
    ),
    db.select<RawPresenceEventRecord[]>(
      'SELECT id, timestamp_ms, state, idle_time_ms, source FROM raw_presence_events ORDER BY timestamp_ms ASC, id ASC'
    ),
    db.select<RawPowerEventRecord[]>(
      'SELECT id, timestamp_ms, state, source FROM raw_power_events ORDER BY timestamp_ms ASC, id ASC'
    ),
  ]);

  const derivedSessions = compileDerivedSessions({
    rawWindowEvents,
    rawPresenceEvents,
    rawPowerEvents,
    nowMs,
    minSessionSecs,
    shouldTrack: (exeName) => ProcessMapper.shouldTrack(exeName),
  });

  await db.execute('DELETE FROM derived_sessions');

  for (const session of derivedSessions) {
    await db.execute(
      `INSERT INTO derived_sessions (
        start_time_ms,
        end_time_ms,
        duration_ms,
        exe_name,
        window_title,
        process_path,
        cut_reason,
        source_window_start_id,
        source_window_end_id,
        source_presence_start_id,
        source_presence_end_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.start_time_ms,
        session.end_time_ms,
        session.duration_ms,
        session.exe_name,
        session.window_title,
        session.process_path,
        session.cut_reason,
        session.source_window_start_id,
        session.source_window_end_id,
        session.source_presence_start_id,
        session.source_presence_end_id,
      ]
    );
  }

  return derivedSessions;
};

export const recordRawTrackingSnapshot = async (win: TrackedWindow, timestampMs: number) => {
  await enqueueRawEventEntries(buildRawTrackingQueueEntries(win, timestampMs));
  await flushRawEventQueue();
};

export const recordRawPowerEvent = async (event: RawPowerEvent) => {
  await enqueueRawEventEntries([buildRawPowerQueueEntry(event)]);
  await flushRawEventQueue();
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
    const db = await getDB();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const ts = startOfToday.getTime();
    const now = Date.now();

    const rows = await db.select<Array<{ app_name: string; exe_name: string; total_duration: number }>>(
      "SELECT app_name, exe_name, SUM(COALESCE(duration, MAX(0, ? - start_time))) as total_duration FROM sessions WHERE start_time >= ? GROUP BY exe_name ORDER BY total_duration DESC",
      [now, ts]
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
  const now = Date.now();
  const rows = await db.select<HistorySession[]>(
    "SELECT id, app_name, exe_name, window_title, start_time, end_time, COALESCE(duration, MAX(0, ? - start_time)) as duration FROM sessions WHERE start_time >= ? AND start_time <= ? ORDER BY start_time ASC",
    [now, start.getTime(), end.getTime()]
  );

  return rows.filter((row) => ProcessMapper.shouldTrack(row.exe_name));
};

export const getDerivedSessionsByDate = async (date: Date): Promise<StoredDerivedSession[]> => {
  const db = await getDB();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return db.select<StoredDerivedSession[]>(
    `SELECT
      id,
      start_time_ms,
      end_time_ms,
      duration_ms,
      exe_name,
      window_title,
      process_path,
      cut_reason,
      source_window_start_id,
      source_window_end_id,
      source_presence_start_id,
      source_presence_end_id
    FROM derived_sessions
    WHERE start_time_ms >= ? AND start_time_ms <= ?
    ORDER BY start_time_ms ASC, id ASC`,
    [start.getTime(), end.getTime()]
  );
};

export const compareTrackingForDate = async (date: Date) => {
  const [legacySessions, derivedSessions] = await Promise.all([
    getHistoryByDate(date),
    getDerivedSessionsByDate(date),
  ]);

  return compareDaySessions(legacySessions, derivedSessions);
};

export interface DailySummary {
  date: string;
  total_duration: number;
}

export const getWeeklyStats = async (): Promise<DailySummary[]> => {
  const db = await getDB();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const rows = await db.select<Array<{ exe_name: string; start_time: number; duration: number }>>(
    "SELECT exe_name, start_time, COALESCE(duration, MAX(0, ? - start_time)) as duration FROM sessions WHERE start_time >= ? ORDER BY start_time ASC",
    [now, sevenDaysAgo]
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
