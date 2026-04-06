import { getDB } from "./db";
import { ProcessMapper, type AppOverride } from "./ProcessMapper.ts";
import {
  isAppCategory,
  isCustomCategory,
  type AppCategory,
  type CustomAppCategory,
} from "./config/categoryTokens.ts";
import { resolveCanonicalExecutable, shouldTrackProcess } from "./processNormalization.ts";

const APP_OVERRIDE_KEY_PREFIX = "__app_override::";
const CATEGORY_COLOR_OVERRIDE_KEY_PREFIX = "__category_color_override::";
const CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX = "__category_default_color_assignment::";
const CUSTOM_CATEGORY_KEY_PREFIX = "__custom_category::";
const DELETED_CATEGORY_KEY_PREFIX = "__deleted_category::";

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

async function upsertSettingValue(key: string, value: string) {
  const db = await getDB();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function loadAppOverrides(): Promise<Record<string, AppOverride>> {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings WHERE key LIKE ?",
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
}

export async function saveAppOverride(exeName: string, override: AppOverride | null): Promise<void> {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  if (!canonicalExe) {
    return;
  }

  const key = `${APP_OVERRIDE_KEY_PREFIX}${canonicalExe}`;
  const db = await getDB();

  if (!override || override.enabled === false) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }

  await upsertSettingValue(key, ProcessMapper.toOverrideStorageValue(override));
}

export async function clearAllAppOverrides(): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM settings WHERE key LIKE ?", [`${APP_OVERRIDE_KEY_PREFIX}%`]);
}

export async function loadCategoryColorOverrides(): Promise<Record<string, string>> {
  const db = await getDB();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings WHERE key LIKE ?",
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
}

export async function saveCategoryColorOverride(
  category: AppCategory,
  colorValue: string | null,
): Promise<void> {
  const key = `${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}${category}`;
  const db = await getDB();
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
}

export async function clearAllCategoryColorOverrides(): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM settings WHERE key LIKE ?", [`${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}%`]);
}

export async function loadCategoryDefaultColorAssignments(): Promise<Record<string, string>> {
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
}

export async function saveCategoryDefaultColorAssignment(
  category: AppCategory,
  colorValue: string | null,
): Promise<void> {
  const key = `${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`;
  const db = await getDB();
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
}

export async function loadCustomCategories(): Promise<CustomAppCategory[]> {
  const db = await getDB();
  const rows = await db.select<{ key: string }[]>(
    "SELECT key FROM settings WHERE key LIKE ?",
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
}

export async function saveCustomCategory(category: CustomAppCategory): Promise<void> {
  const key = `${CUSTOM_CATEGORY_KEY_PREFIX}${category}`;
  await upsertSettingValue(key, String(Date.now()));
}

export async function deleteCustomCategory(category: CustomAppCategory): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CUSTOM_CATEGORY_KEY_PREFIX}${category}`]);
  await db.execute("DELETE FROM settings WHERE key = ?", [`${DELETED_CATEGORY_KEY_PREFIX}${category}`]);
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`]);
}

export async function loadDeletedCategories(): Promise<AppCategory[]> {
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
}

export async function saveDeletedCategory(category: AppCategory, deleted: boolean): Promise<void> {
  const key = `${DELETED_CATEGORY_KEY_PREFIX}${category}`;
  const db = await getDB();
  if (!deleted) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }
  await upsertSettingValue(key, String(Date.now()));
  await db.execute("DELETE FROM settings WHERE key = ?", [`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`]);
}

export async function loadOtherCategoryCandidates(
  days: number = 30,
  limit: number = 30,
): Promise<OtherCategoryCandidate[]> {
  const observed = await loadObservedAppCandidates(days, Math.max(limit, 1) * 2);
  const otherOnly = observed.filter((item) => (
    ProcessMapper.map(item.exeName, { appName: item.appName }).category === "other"
  ));
  return otherOnly.slice(0, Math.max(1, limit));
}

export async function loadObservedAppCandidates(
  days: number = 30,
  limit: number = 120,
): Promise<ObservedAppCandidate[]> {
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
}

export async function deleteObservedAppSessions(
  exeName: string,
  scope: DeleteAppSessionScope = "all",
): Promise<number> {
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
}
