import { ProcessMapper } from "../../lib/ProcessMapper.ts";
import * as classificationPersistence from "../../shared/lib/classificationPersistence";

export type ProcessMapperRuntimeSnapshot = classificationPersistence.ProcessMapperClassificationSnapshot;

export async function loadProcessMapperRuntimeSnapshot(): Promise<ProcessMapperRuntimeSnapshot> {
  return classificationPersistence.loadProcessMapperClassificationSnapshot();
}

export function applyProcessMapperRuntimeSnapshot(snapshot: ProcessMapperRuntimeSnapshot): void {
  ProcessMapper.setUserOverrides(snapshot.overrides);
  ProcessMapper.setCategoryColorOverrides(snapshot.categoryColorOverrides);
  ProcessMapper.setCategoryDefaultColorAssignments(snapshot.categoryDefaultColorAssignments);
  ProcessMapper.setDeletedCategories(snapshot.deletedCategories);
  ProcessMapper.setCategoryDefaultColorAssignmentPersistence(
    classificationPersistence.saveCategoryDefaultColorAssignment,
  );
}

export async function refreshProcessMapperRuntime(): Promise<void> {
  const snapshot = await loadProcessMapperRuntimeSnapshot();
  applyProcessMapperRuntimeSnapshot(snapshot);
}

export async function initializeProcessMapperRuntime(): Promise<void> {
  await refreshProcessMapperRuntime();
}
