import {
  deleteSessionsByExeNames,
  deleteSessionsByExeNamesBetween,
  deleteSettingsByKeyPrefix,
  deleteSettingValue,
  loadDistinctSessionExeNames,
  loadObservedSessionStats,
  loadSettingKeysByKeyPrefix,
  loadSettingRowsByKeyPrefix,
  upsertSettingValue,
} from "../../../platform/persistence/classificationPersistence.ts";
import {
  commitClassificationSettingMutations,
  type ClassificationSettingMutation,
} from "../../../platform/persistence/classificationSettingsGateway.ts";
import { ProcessMapper, type AppOverride } from "./ProcessMapper.ts";
import {
  isAppCategory,
  isCustomCategory,
  type AppCategory,
  type CustomAppCategory,
} from "../config/categoryTokens.ts";
import { resolveCanonicalExecutable, shouldTrackProcess } from "./processNormalization.ts";
import type { ClassificationDraftChangePlan } from "./classificationDraftState.ts";

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

function isPersistableDeletedCategory(category: string): category is AppCategory {
  return isAppCategory(category)
    && !isCustomCategory(category)
    && category !== "system"
    && category !== "other";
}

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

export async function loadAppOverrides(): Promise<Record<string, AppOverride>> {
  const rows = await loadSettingRowsByKeyPrefix(APP_OVERRIDE_KEY_PREFIX);

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

  if (!override || override.enabled === false) {
    await deleteSettingValue(key);
    return;
  }

  await upsertSettingValue(key, ProcessMapper.toOverrideStorageValue(override));
}

function buildSaveAppOverrideMutations(
  exeName: string,
  override: AppOverride | null,
): ClassificationSettingMutation[] {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  if (!canonicalExe) {
    return [];
  }

  const key = `${APP_OVERRIDE_KEY_PREFIX}${canonicalExe}`;

  if (!override || override.enabled === false) {
    return [{
      key,
      value: null,
    }];
  }

  return [{
    key,
    value: ProcessMapper.toOverrideStorageValue(override),
  }];
}

export async function clearAllAppOverrides(): Promise<void> {
  await deleteSettingsByKeyPrefix(APP_OVERRIDE_KEY_PREFIX);
}

export async function loadCategoryColorOverrides(): Promise<Record<string, string>> {
  const rows = await loadSettingRowsByKeyPrefix(CATEGORY_COLOR_OVERRIDE_KEY_PREFIX);

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
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await deleteSettingValue(key);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
}

function buildSaveCategoryColorOverrideMutations(
  category: AppCategory,
  colorValue: string | null,
): ClassificationSettingMutation[] {
  const key = `${CATEGORY_COLOR_OVERRIDE_KEY_PREFIX}${category}`;
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    return [{
      key,
      value: null,
    }];
  }

  return [{
    key,
    value: normalizedColor,
  }];
}

export async function clearAllCategoryColorOverrides(): Promise<void> {
  await deleteSettingsByKeyPrefix(CATEGORY_COLOR_OVERRIDE_KEY_PREFIX);
}

export async function loadCategoryDefaultColorAssignments(): Promise<Record<string, string>> {
  const rows = await loadSettingRowsByKeyPrefix(CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX);

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
  const normalizedColor = normalizeHexColor(colorValue ?? undefined);
  if (!normalizedColor) {
    await deleteSettingValue(key);
    return;
  }

  await upsertSettingValue(key, normalizedColor);
}

export async function loadCustomCategories(): Promise<CustomAppCategory[]> {
  const rows = await loadSettingKeysByKeyPrefix(CUSTOM_CATEGORY_KEY_PREFIX);

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

function buildSaveCustomCategoryMutations(category: CustomAppCategory): ClassificationSettingMutation[] {
  return [{
    key: `${CUSTOM_CATEGORY_KEY_PREFIX}${category}`,
    value: String(Date.now()),
  }];
}

export async function deleteCustomCategory(category: CustomAppCategory): Promise<void> {
  await deleteSettingValue(`${CUSTOM_CATEGORY_KEY_PREFIX}${category}`);
  await deleteSettingValue(`${DELETED_CATEGORY_KEY_PREFIX}${category}`);
  await deleteSettingValue(`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`);
}

function buildDeleteCustomCategoryMutations(category: CustomAppCategory): ClassificationSettingMutation[] {
  return [
    {
      key: `${CUSTOM_CATEGORY_KEY_PREFIX}${category}`,
      value: null,
    },
    {
      key: `${DELETED_CATEGORY_KEY_PREFIX}${category}`,
      value: null,
    },
    {
      key: `${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`,
      value: null,
    },
  ];
}

export async function loadDeletedCategories(): Promise<AppCategory[]> {
  const rows = await loadSettingKeysByKeyPrefix(DELETED_CATEGORY_KEY_PREFIX);

  const categories = new Set<AppCategory>();
  for (const row of rows) {
    const category = row.key.slice(DELETED_CATEGORY_KEY_PREFIX.length);
    if (!isPersistableDeletedCategory(category)) {
      await deleteSettingValue(row.key);
      continue;
    }
    categories.add(category);
  }

  return Array.from(categories);
}

export async function saveDeletedCategory(category: AppCategory, deleted: boolean): Promise<void> {
  const key = `${DELETED_CATEGORY_KEY_PREFIX}${category}`;
  if (!isPersistableDeletedCategory(category)) {
    await deleteSettingValue(key);
    return;
  }
  if (!deleted) {
    await deleteSettingValue(key);
    return;
  }
  await upsertSettingValue(key, String(Date.now()));
  await deleteSettingValue(`${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`);
}

function buildSaveDeletedCategoryMutations(
  category: AppCategory,
  deleted: boolean,
): ClassificationSettingMutation[] {
  const key = `${DELETED_CATEGORY_KEY_PREFIX}${category}`;
  if (!isPersistableDeletedCategory(category) || !deleted) {
    return [{
      key,
      value: null,
    }];
  }

  return [
    {
      key,
      value: String(Date.now()),
    },
    {
      key: `${CATEGORY_DEFAULT_COLOR_ASSIGNMENT_KEY_PREFIX}${category}`,
      value: null,
    },
  ];
}

export function buildCommitDraftChangePlanSettingMutations(
  changePlan: ClassificationDraftChangePlan,
): ClassificationSettingMutation[] {
  const mutations: ClassificationSettingMutation[] = [];

  for (const update of changePlan.overrideUpserts) {
    mutations.push(...buildSaveAppOverrideMutations(update.exeName, update.override));
  }

  for (const update of changePlan.categoryColorUpdates) {
    mutations.push(...buildSaveCategoryColorOverrideMutations(update.category, update.colorValue));
  }

  for (const category of changePlan.customCategoriesToAdd) {
    mutations.push(...buildSaveCustomCategoryMutations(category));
    mutations.push(...buildSaveDeletedCategoryMutations(category, false));
  }

  for (const category of changePlan.customCategoriesToRemove) {
    mutations.push(...buildDeleteCustomCategoryMutations(category));
    mutations.push(...buildSaveDeletedCategoryMutations(category, false));
    mutations.push(...buildSaveCategoryColorOverrideMutations(category, null));
  }

  for (const update of changePlan.deletedCategoryUpdates) {
    mutations.push(...buildSaveDeletedCategoryMutations(update.category, update.deleted));
  }

  return mutations;
}

export async function commitDraftChangePlan(changePlan: ClassificationDraftChangePlan): Promise<void> {
  await commitClassificationSettingMutations(buildCommitDraftChangePlanSettingMutations(changePlan));
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
  const sinceMs = Date.now() - (Math.max(1, days) * 24 * 60 * 60 * 1000);
  const nowMs = Date.now();
  const rows = await loadObservedSessionStats(sinceMs, nowMs);

  const merged = new Map<string, ObservedAppCandidate>();

  for (const row of rows) {
    const canonicalExe = resolveCanonicalExecutable(row.exeName);
    if (!canonicalExe || !shouldTrackProcess(row.exeName)) {
      continue;
    }

    const mapped = ProcessMapper.map(canonicalExe, { appName: row.appName });
    if (mapped.category === "system") {
      continue;
    }
    const previous = merged.get(canonicalExe);
    const duration = Math.max(0, Number(row.totalDuration ?? 0));
    const lastSeenMs = Math.max(0, Number(row.lastSeenMs ?? 0));
    const appName = row.appName?.trim() || mapped.name;

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

  const rows = await loadDistinctSessionExeNames();
  const matchedExeNames = rows
    .map((row) => row.exeName)
    .filter((rawExeName) => resolveCanonicalExecutable(rawExeName) === canonicalExe);

  if (matchedExeNames.length === 0) {
    return 0;
  }

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (scope === "all") {
    await deleteSessionsByExeNames(matchedExeNames);
    return matchedExeNames.length;
  }

  await deleteSessionsByExeNamesBetween(
    matchedExeNames,
    dayStart.getTime(),
    dayEnd.getTime(),
  );

  return matchedExeNames.length;
}
