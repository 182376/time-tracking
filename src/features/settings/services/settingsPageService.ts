import { getVersion } from "@tauri-apps/api/app";
import type { AppSettings } from "../../../lib/settings";
import { SettingsService } from "../../../lib/services/SettingsService";
import type { CleanupRange } from "../types";

export { type BackupPreview } from "../../../lib/services/SettingsService";

export interface SettingsPageBootstrapData {
  settings: AppSettings;
  appVersion: string;
}

export interface BackupRestorePreparation {
  path: string;
  preview: import("../../../lib/services/SettingsService").BackupPreview;
  previewSummary: string;
  compatible: boolean;
  incompatibilityMessage?: string;
}

function resolveCleanupCutoffTime(range: CleanupRange, nowMs: number): number {
  const date = new Date(nowMs);
  date.setDate(date.getDate() - range);
  return date.getTime();
}

function buildBackupPreviewSummary(preview: import("../../../lib/services/SettingsService").BackupPreview): string {
  const exportedAt = new Date(preview.exported_at_ms).toLocaleString();
  return [
    `备份版本：v${preview.version}（Schema ${preview.schema_version}）`,
    `导出时间：${exportedAt}`,
    `应用版本：${preview.app_version}`,
    `兼容提示：${preview.compatibility_message}`,
    `会话数：${preview.session_count}，设置项：${preview.setting_count}，图标缓存：${preview.icon_cache_count}`,
  ].join("\n");
}

export class SettingsPageService {
  static async loadBootstrap(): Promise<SettingsPageBootstrapData> {
    const [settings, appVersion] = await Promise.all([
      SettingsService.load(),
      getVersion().catch(() => "unknown"),
    ]);

    return {
      settings,
      appVersion,
    };
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await SettingsService.updateSetting(key, value);
  }

  static async clearSessionsByRange(range: CleanupRange, nowMs: number = Date.now()): Promise<void> {
    const cutoffTime = resolveCleanupCutoffTime(range, nowMs);
    await SettingsService.clearSessionsBefore(cutoffTime);
  }

  static async exportBackupWithPicker(initialPath?: string): Promise<string | null> {
    const selectedPath = await SettingsService.pickBackupSaveFile(initialPath);
    if (!selectedPath) {
      return null;
    }

    return SettingsService.exportBackup(selectedPath);
  }

  static async prepareBackupRestore(initialPath?: string): Promise<BackupRestorePreparation | null> {
    const selectedPath = await SettingsService.pickBackupFile(initialPath);
    if (!selectedPath) {
      return null;
    }

    const preview = await SettingsService.previewBackup(selectedPath);
    if (preview.compatibility_level === "incompatible") {
      return {
        path: selectedPath,
        preview,
        previewSummary: "",
        compatible: false,
        incompatibilityMessage: preview.compatibility_message,
      };
    }

    return {
      path: selectedPath,
      preview,
      previewSummary: buildBackupPreviewSummary(preview),
      compatible: true,
    };
  }

  static async restoreBackup(path: string): Promise<void> {
    await SettingsService.restoreBackup(path);
  }
}
