import { ProcessMapper, type AppOverride } from "../../../lib/ProcessMapper";
import type { AppCategory, CustomAppCategory } from "../../../lib/config/categoryTokens";
import type { ObservedAppCandidate } from "../../../lib/settings";
import { SettingsService } from "../../../lib/services/SettingsService";

export interface ClassificationBootstrapData {
  observed: ObservedAppCandidate[];
  loadedOverrides: Record<string, AppOverride>;
  loadedCategoryColorOverrides: Record<string, string>;
  loadedCustomCategories: CustomAppCategory[];
  loadedDeletedCategories: AppCategory[];
}

export class ClassificationService {
  static async loadObservedAppCandidates(days: number = 30, limit: number = 120): Promise<ObservedAppCandidate[]> {
    return SettingsService.loadObservedAppCandidates(days, limit);
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
      SettingsService.loadAppOverrides(),
      SettingsService.loadCategoryColorOverrides(),
      SettingsService.loadCustomCategories(),
      SettingsService.loadDeletedCategories(),
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
    await SettingsService.saveAppOverride(exeName, override);
    ProcessMapper.setUserOverride(exeName, override);
  }

  static async saveCategoryColorOverride(category: AppCategory, colorValue: string | null) {
    await SettingsService.saveCategoryColorOverride(category, colorValue);
    ProcessMapper.setCategoryColorOverride(category, colorValue);
  }

  static async removeCategoryDefaultColorAssignment(category: AppCategory) {
    await ProcessMapper.removeCategoryDefaultColorAssignment(category);
  }

  static setDeletedCategories(categories: AppCategory[]) {
    ProcessMapper.setDeletedCategories(categories);
  }

  static async saveCustomCategory(category: CustomAppCategory) {
    await SettingsService.saveCustomCategory(category);
  }

  static async deleteCustomCategory(category: CustomAppCategory) {
    await SettingsService.deleteCustomCategory(category);
  }

  static async saveDeletedCategory(category: AppCategory, deleted: boolean) {
    await SettingsService.saveDeletedCategory(category, deleted);
  }

  static async deleteObservedAppSessions(exeName: string, scope: "today" | "all" = "all") {
    await SettingsService.deleteObservedAppSessions(exeName, scope);
  }
}
