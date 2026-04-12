import { ProcessMapper } from "../../../lib/ProcessMapper.ts";
import type { AppOverride } from "../../../lib/ProcessMapper.ts";
import {
  USER_ASSIGNABLE_CATEGORIES,
  isCustomCategory,
  type AppCategory,
  type CustomAppCategory,
} from "../../../lib/config/categoryTokens";
import * as classificationPersistence from "../../../shared/lib/classificationPersistence";
import type { ObservedAppCandidate } from "../../../shared/lib/classificationPersistence";

export type { AppOverride } from "../../../lib/ProcessMapper.ts";

export interface ClassificationBootstrapData {
  observed: ObservedAppCandidate[];
  loadedOverrides: Record<string, AppOverride>;
  loadedCategoryColorOverrides: Record<string, string>;
  loadedCustomCategories: CustomAppCategory[];
  loadedDeletedCategories: AppCategory[];
}

export interface ClassificationDraftState {
  overrides: Record<string, AppOverride>;
  categoryColorOverrides: Record<string, string>;
  customCategories: CustomAppCategory[];
  deletedCategories: AppCategory[];
}

function sanitizeDeletedCategories(categories: AppCategory[]): AppCategory[] {
  return categories.filter((category) => (
    !isCustomCategory(category)
    && category !== "system"
    && category !== "other"
  ));
}

function normalizeOverride(override: AppOverride | null | undefined): AppOverride | null {
  if (!override) return null;
  if (override.enabled === false) return null;
  const next: AppOverride = {};
  if (override.category) next.category = override.category;
  if (override.displayName?.trim()) next.displayName = override.displayName.trim();
  if (override.color) next.color = override.color;
  if (override.track === false) next.track = false;
  if (override.captureTitle === false) next.captureTitle = false;
  if (typeof override.updatedAt === "number") next.updatedAt = override.updatedAt;
  next.enabled = true;
  const hasMeaningfulValue = Boolean(
    next.category
    || next.displayName
    || next.color
    || next.track === false
    || next.captureTitle === false,
  );
  return hasMeaningfulValue ? next : null;
}

function areOverridesEqual(left: AppOverride | null, right: AppOverride | null): boolean {
  const l = normalizeOverride(left);
  const r = normalizeOverride(right);
  if (!l && !r) return true;
  if (!l || !r) return false;
  return l.category === r.category
    && l.displayName === r.displayName
    && l.color === r.color
    && l.track === r.track
    && l.captureTitle === r.captureTitle;
}

function areStringMapsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export class ClassificationService {
  static async loadObservedAppCandidates(days: number = 30, limit: number = 120): Promise<ObservedAppCandidate[]> {
    return classificationPersistence.loadObservedAppCandidates(days, limit);
  }

  static async loadClassificationBootstrap(): Promise<ClassificationBootstrapData> {
    const [
      observed,
      loadedOverrides,
      loadedCategoryColorOverrides,
      loadedCustomCategories,
      loadedDeletedCategories,
    ] = await Promise.all([
      this.loadObservedAppCandidates(),
      classificationPersistence.loadAppOverrides(),
      classificationPersistence.loadCategoryColorOverrides(),
      classificationPersistence.loadCustomCategories(),
      classificationPersistence.loadDeletedCategories(),
    ]);

    const sanitizedDeletedCategories = sanitizeDeletedCategories(loadedDeletedCategories ?? []);

    return {
      observed,
      loadedOverrides,
      loadedCategoryColorOverrides: loadedCategoryColorOverrides ?? {},
      loadedCustomCategories,
      loadedDeletedCategories: sanitizedDeletedCategories,
    };
  }

  static async saveAppOverride(exeName: string, override: AppOverride | null) {
    await classificationPersistence.saveAppOverride(exeName, override);
    ProcessMapper.setUserOverride(exeName, override);
  }

  static async saveCategoryColorOverride(category: AppCategory, colorValue: string | null) {
    await classificationPersistence.saveCategoryColorOverride(category, colorValue);
    ProcessMapper.setCategoryColorOverride(category, colorValue);
  }

  static async removeCategoryDefaultColorAssignment(category: AppCategory) {
    await ProcessMapper.removeCategoryDefaultColorAssignment(category);
  }

  static setDeletedCategories(categories: AppCategory[]) {
    ProcessMapper.setDeletedCategories(sanitizeDeletedCategories(categories));
  }

  static async saveCustomCategory(category: CustomAppCategory) {
    await classificationPersistence.saveCustomCategory(category);
  }

  static async deleteCustomCategory(category: CustomAppCategory) {
    await classificationPersistence.deleteCustomCategory(category);
  }

  static async saveDeletedCategory(category: AppCategory, deleted: boolean) {
    await classificationPersistence.saveDeletedCategory(category, deleted);
  }

  static async deleteObservedAppSessions(exeName: string, scope: "today" | "all" = "all") {
    await classificationPersistence.deleteObservedAppSessions(exeName, scope);
  }

  static hasDraftChanges(saved: ClassificationDraftState, draft: ClassificationDraftState): boolean {
    if (!areStringMapsEqual(saved.categoryColorOverrides, draft.categoryColorOverrides)) {
      return true;
    }
    if (!areStringArraysEqual(saved.customCategories, draft.customCategories)) {
      return true;
    }
    if (!areStringArraysEqual(
      sanitizeDeletedCategories(saved.deletedCategories),
      sanitizeDeletedCategories(draft.deletedCategories),
    )) {
      return true;
    }

    const exeNames = new Set([...Object.keys(saved.overrides), ...Object.keys(draft.overrides)]);
    for (const exeName of exeNames) {
      const savedOverride = saved.overrides[exeName] ?? null;
      const draftOverride = draft.overrides[exeName] ?? null;
      if (!areOverridesEqual(savedOverride, draftOverride)) {
        return true;
      }
    }

    return false;
  }

  static async commitDraftChanges(saved: ClassificationDraftState, draft: ClassificationDraftState): Promise<void> {
    const savedDeletedCategories = sanitizeDeletedCategories(saved.deletedCategories);
    const draftDeletedCategories = sanitizeDeletedCategories(draft.deletedCategories);

    const savedOverrideKeys = new Set(Object.keys(saved.overrides));
    const draftOverrideKeys = new Set(Object.keys(draft.overrides));
    const overrideKeys = new Set([...savedOverrideKeys, ...draftOverrideKeys]);
    for (const exeName of overrideKeys) {
      const savedOverride = saved.overrides[exeName] ?? null;
      const draftOverride = draft.overrides[exeName] ?? null;
      if (!areOverridesEqual(savedOverride, draftOverride)) {
        await classificationPersistence.saveAppOverride(exeName, draftOverride);
      }
    }

    const colorKeys = new Set([
      ...Object.keys(saved.categoryColorOverrides),
      ...Object.keys(draft.categoryColorOverrides),
    ]);
    for (const category of colorKeys) {
      const savedColor = saved.categoryColorOverrides[category];
      const draftColor = draft.categoryColorOverrides[category];
      if (savedColor === draftColor) continue;
      await classificationPersistence.saveCategoryColorOverride(category as AppCategory, draftColor ?? null);
    }

    const savedCustom = new Set(saved.customCategories);
    const draftCustom = new Set(draft.customCategories);
    for (const category of draftCustom) {
      if (!savedCustom.has(category)) {
        await classificationPersistence.saveCustomCategory(category);
      }
      await classificationPersistence.saveDeletedCategory(category, false);
    }
    for (const category of savedCustom) {
      if (draftCustom.has(category)) continue;
      await ProcessMapper.removeCategoryDefaultColorAssignment(category);
      await classificationPersistence.deleteCustomCategory(category);
      await classificationPersistence.saveDeletedCategory(category, false);
      await classificationPersistence.saveCategoryColorOverride(category, null);
    }

    const assignableCategories = USER_ASSIGNABLE_CATEGORIES.filter((category) => (
      !isCustomCategory(category) && category !== "other"
    ));
    for (const category of assignableCategories) {
      const savedDeleted = savedDeletedCategories.includes(category);
      const draftDeleted = draftDeletedCategories.includes(category);
      if (savedDeleted !== draftDeleted) {
        await classificationPersistence.saveDeletedCategory(category, draftDeleted);
      }
    }

    ProcessMapper.setUserOverrides(draft.overrides);
    ProcessMapper.setCategoryColorOverrides(draft.categoryColorOverrides);
    ProcessMapper.setDeletedCategories(draftDeletedCategories);
  }
}
