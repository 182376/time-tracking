import { ProcessMapper } from "../../../lib/ProcessMapper";
import type { AppOverride } from "../../../lib/ProcessMapper";
import type { AppCategory, CustomAppCategory } from "../../../lib/config/categoryTokens";
import * as classificationPersistence from "../../../shared/lib/classificationPersistence";
import type { ObservedAppCandidate } from "../../../shared/lib/classificationPersistence";

export type { AppOverride } from "../../../lib/ProcessMapper";

export interface ClassificationBootstrapData {
  observed: ObservedAppCandidate[];
  loadedOverrides: Record<string, AppOverride>;
  loadedCategoryColorOverrides: Record<string, string>;
  loadedCustomCategories: CustomAppCategory[];
  loadedDeletedCategories: AppCategory[];
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

    return {
      observed,
      loadedOverrides,
      loadedCategoryColorOverrides: loadedCategoryColorOverrides ?? {},
      loadedCustomCategories,
      loadedDeletedCategories: loadedDeletedCategories ?? [],
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
    ProcessMapper.setDeletedCategories(categories);
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
}
