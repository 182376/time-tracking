import { invoke } from "@tauri-apps/api/core";
import {
  clearAllAppOverrides,
  clearAllCategoryColorOverrides,
  clearAllWindowTitles,
  clearSessionsBefore,
  deleteObservedAppSessions,
  loadAppOverrides,
  loadCategoryColorOverrides,
  loadCategoryDefaultColorAssignments,
  loadCustomCategories,
  loadDeletedCategories,
  loadObservedAppCandidates,
  loadOtherCategoryCandidates,
  loadTrackerHealthTimestamp,
  loadSettings,
  saveAppOverride,
  saveCategoryColorOverride,
  saveCategoryDefaultColorAssignment,
  saveCustomCategory,
  saveDeletedCategory,
  deleteCustomCategory,
  saveSetting,
  type AppSettings,
  type ObservedAppCandidate,
  type OtherCategoryCandidate,
} from "../settings";
import type { AppOverride } from "../ProcessMapper.ts";
import type { AppCategory, CustomAppCategory } from "../config/categoryTokens.ts";
import { TrackingService } from "./TrackingService";

export interface BackupPreview {
  version: number;
  exported_at_ms: number;
  schema_version: number;
  app_version: string;
  compatibility_level: string;
  compatibility_message: string;
  session_count: number;
  setting_count: number;
  icon_cache_count: number;
}

export class SettingsService {
  static async load() {
    return loadSettings();
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await TrackingService.setAfkTimeout(value as number);
    }
  }

  static async clearSessionsBefore(cutoffTime: number) {
    await clearSessionsBefore(cutoffTime);
  }

  static async clearAllWindowTitles() {
    await clearAllWindowTitles();
  }

  static async loadTrackerHealthTimestamp() {
    return loadTrackerHealthTimestamp();
  }

  static async loadAppOverrides() {
    return loadAppOverrides();
  }

  static async saveAppOverride(exeName: string, override: AppOverride | null) {
    await saveAppOverride(exeName, override);
  }

  static async clearAllAppOverrides() {
    await clearAllAppOverrides();
  }

  static async loadCategoryColorOverrides() {
    return loadCategoryColorOverrides();
  }

  static async saveCategoryColorOverride(category: AppCategory, colorValue: string | null) {
    await saveCategoryColorOverride(category, colorValue);
  }

  static async clearAllCategoryColorOverrides() {
    await clearAllCategoryColorOverrides();
  }

  static async loadCategoryDefaultColorAssignments() {
    return loadCategoryDefaultColorAssignments();
  }

  static async saveCategoryDefaultColorAssignment(category: AppCategory, colorValue: string | null) {
    await saveCategoryDefaultColorAssignment(category, colorValue);
  }

  static async loadCustomCategories() {
    return loadCustomCategories();
  }

  static async saveCustomCategory(category: CustomAppCategory) {
    await saveCustomCategory(category);
  }

  static async deleteCustomCategory(category: CustomAppCategory) {
    await deleteCustomCategory(category);
  }

  static async loadDeletedCategories() {
    return loadDeletedCategories();
  }

  static async saveDeletedCategory(category: AppCategory, deleted: boolean) {
    await saveDeletedCategory(category, deleted);
  }

  static async loadOtherCategoryCandidates(days: number = 30, limit: number = 30): Promise<OtherCategoryCandidate[]> {
    return loadOtherCategoryCandidates(days, limit);
  }

  static async loadObservedAppCandidates(days: number = 30, limit: number = 120): Promise<ObservedAppCandidate[]> {
    return loadObservedAppCandidates(days, limit);
  }

  static async deleteObservedAppSessions(exeName: string, scope: "today" | "all" = "all") {
    return deleteObservedAppSessions(exeName, scope);
  }

  static async exportBackup(path?: string): Promise<string> {
    return invoke<string>("cmd_export_backup", { backupPath: path ?? null });
  }

  static async restoreBackup(path: string): Promise<void> {
    await invoke("cmd_restore_backup", { backupPath: path });
  }

  static async previewBackup(path: string): Promise<BackupPreview> {
    return invoke<BackupPreview>("cmd_preview_backup", { backupPath: path });
  }

  static async pickBackupSaveFile(initialPath?: string): Promise<string | null> {
    return invoke<string | null>("cmd_pick_backup_save_file", { initialPath: initialPath ?? null });
  }

  static async pickBackupFile(initialPath?: string): Promise<string | null> {
    return invoke<string | null>("cmd_pick_backup_file", { initialPath: initialPath ?? null });
  }
}
