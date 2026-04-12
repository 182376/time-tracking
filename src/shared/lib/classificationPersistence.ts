import type { AppOverride } from "../../lib/ProcessMapper.ts";
import type { AppCategory, CustomAppCategory } from "../../lib/config/categoryTokens.ts";
import {
  loadAppOverrides as loadAppOverridesFromStore,
  saveAppOverride as saveAppOverrideToStore,
  loadCategoryColorOverrides as loadCategoryColorOverridesFromStore,
  saveCategoryColorOverride as saveCategoryColorOverrideToStore,
  loadCategoryDefaultColorAssignments as loadCategoryDefaultColorAssignmentsFromStore,
  saveCategoryDefaultColorAssignment as saveCategoryDefaultColorAssignmentToStore,
  loadCustomCategories as loadCustomCategoriesFromStore,
  saveCustomCategory as saveCustomCategoryToStore,
  deleteCustomCategory as deleteCustomCategoryFromStore,
  loadDeletedCategories as loadDeletedCategoriesFromStore,
  saveDeletedCategory as saveDeletedCategoryToStore,
  loadObservedAppCandidates as loadObservedAppCandidatesFromStore,
  deleteObservedAppSessions as deleteObservedAppSessionsFromStore,
  type ObservedAppCandidate as StoreObservedAppCandidate,
} from "../../lib/classification-store.ts";

export type ObservedAppCandidate = StoreObservedAppCandidate;

export interface ProcessMapperClassificationSnapshot {
  overrides: Record<string, AppOverride>;
  categoryColorOverrides: Record<string, string>;
  categoryDefaultColorAssignments: Record<string, string>;
  deletedCategories: AppCategory[];
}

export async function loadAppOverrides(): Promise<Record<string, AppOverride>> {
  return loadAppOverridesFromStore();
}

export async function saveAppOverride(exeName: string, override: AppOverride | null): Promise<void> {
  await saveAppOverrideToStore(exeName, override);
}

export async function loadCategoryColorOverrides(): Promise<Record<string, string>> {
  return loadCategoryColorOverridesFromStore();
}

export async function saveCategoryColorOverride(category: AppCategory, colorValue: string | null): Promise<void> {
  await saveCategoryColorOverrideToStore(category, colorValue);
}

export async function loadCategoryDefaultColorAssignments(): Promise<Record<string, string>> {
  return loadCategoryDefaultColorAssignmentsFromStore();
}

export async function saveCategoryDefaultColorAssignment(
  category: AppCategory,
  colorValue: string | null,
): Promise<void> {
  await saveCategoryDefaultColorAssignmentToStore(category, colorValue);
}

export async function loadCustomCategories(): Promise<CustomAppCategory[]> {
  return loadCustomCategoriesFromStore();
}

export async function saveCustomCategory(category: CustomAppCategory): Promise<void> {
  await saveCustomCategoryToStore(category);
}

export async function deleteCustomCategory(category: CustomAppCategory): Promise<void> {
  await deleteCustomCategoryFromStore(category);
}

export async function loadDeletedCategories(): Promise<AppCategory[]> {
  return loadDeletedCategoriesFromStore();
}

export async function saveDeletedCategory(category: AppCategory, deleted: boolean): Promise<void> {
  await saveDeletedCategoryToStore(category, deleted);
}

export async function loadObservedAppCandidates(
  days: number = 30,
  limit: number = 120,
): Promise<ObservedAppCandidate[]> {
  return loadObservedAppCandidatesFromStore(days, limit);
}

export async function deleteObservedAppSessions(
  exeName: string,
  scope: "today" | "all" = "all",
): Promise<number> {
  return deleteObservedAppSessionsFromStore(exeName, scope);
}

export async function loadProcessMapperClassificationSnapshot(): Promise<ProcessMapperClassificationSnapshot> {
  const [
    overrides,
    categoryColorOverrides,
    categoryDefaultColorAssignments,
    deletedCategories,
  ] = await Promise.all([
    loadAppOverrides(),
    loadCategoryColorOverrides(),
    loadCategoryDefaultColorAssignments(),
    loadDeletedCategories(),
  ]);

  return {
    overrides,
    categoryColorOverrides: categoryColorOverrides ?? {},
    categoryDefaultColorAssignments: categoryDefaultColorAssignments ?? {},
    deletedCategories: deletedCategories ?? [],
  };
}
