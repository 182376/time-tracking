import { ProcessMapper } from "../../lib/ProcessMapper";
import { SettingsService } from "../../lib/services/SettingsService";

export interface ProcessMapperRuntimeSnapshot {
  overrides: Awaited<ReturnType<typeof SettingsService.loadAppOverrides>>;
  categoryColorOverrides: Awaited<ReturnType<typeof SettingsService.loadCategoryColorOverrides>>;
  categoryDefaultColorAssignments: Awaited<ReturnType<typeof SettingsService.loadCategoryDefaultColorAssignments>>;
  deletedCategories: Awaited<ReturnType<typeof SettingsService.loadDeletedCategories>>;
}

export async function loadProcessMapperRuntimeSnapshot(): Promise<ProcessMapperRuntimeSnapshot> {
  const [overrides, categoryColorOverrides, categoryDefaultColorAssignments, deletedCategories] = await Promise.all([
    SettingsService.loadAppOverrides(),
    SettingsService.loadCategoryColorOverrides(),
    SettingsService.loadCategoryDefaultColorAssignments(),
    SettingsService.loadDeletedCategories(),
  ]);

  return {
    overrides,
    categoryColorOverrides: categoryColorOverrides ?? {},
    categoryDefaultColorAssignments: categoryDefaultColorAssignments ?? {},
    deletedCategories: deletedCategories ?? [],
  };
}

export function applyProcessMapperRuntimeSnapshot(snapshot: ProcessMapperRuntimeSnapshot): void {
  ProcessMapper.setUserOverrides(snapshot.overrides);
  ProcessMapper.setCategoryColorOverrides(snapshot.categoryColorOverrides);
  ProcessMapper.setCategoryDefaultColorAssignments(snapshot.categoryDefaultColorAssignments);
  ProcessMapper.setDeletedCategories(snapshot.deletedCategories);
  ProcessMapper.setCategoryDefaultColorAssignmentPersistence(
    SettingsService.saveCategoryDefaultColorAssignment.bind(SettingsService),
  );
}

export async function initializeProcessMapperRuntime(): Promise<void> {
  const snapshot = await loadProcessMapperRuntimeSnapshot();
  applyProcessMapperRuntimeSnapshot(snapshot);
}
