import { getVersion } from "@tauri-apps/api/app";
import {
  clearSessionsBefore,
  loadSettings,
  saveSetting,
  type AppSettings,
} from "../../../shared/lib/settingsPersistenceAdapter";
import {
  exportBackup,
  pickBackupFile,
  pickBackupSaveFile,
  previewBackup,
  restoreBackup,
  type BackupPreview,
} from "../../../shared/lib/backupRuntimeAdapter";
import { setAfkTimeout } from "../../../app/services/trackingRuntimeGateway";
import type { CleanupRange } from "../types";

export type { BackupPreview } from "../../../shared/lib/backupRuntimeAdapter";

export interface SettingsPageBootstrapData {
  settings: AppSettings;
  appVersion: string;
}

export interface BackupRestorePreparation {
  path: string;
  preview: BackupPreview;
  previewSummary: string;
  compatible: boolean;
  incompatibilityMessage?: string;
}

function resolveCleanupCutoffTime(range: CleanupRange, nowMs: number): number {
  const date = new Date(nowMs);
  date.setDate(date.getDate() - range);
  return date.getTime();
}

function buildBackupPreviewSummary(preview: BackupPreview): string {
  const exportedAt = new Date(preview.exported_at_ms).toLocaleString();
  return [
    `备份版本：v${preview.version}（Schema ${preview.schema_version}）`,
    `导出时间：${exportedAt}`,
    `应用版本：${preview.app_version}`,
    `兼容提示：${preview.compatibility_message}`,
    `会话数：${preview.session_count}，设置项：${preview.setting_count}，图标缓存：${preview.icon_cache_count}`,
  ].join("\n");
}

export class SettingsRuntimeAdapterService {
  static async loadBootstrap(): Promise<SettingsPageBootstrapData> {
    const [settings, appVersion] = await Promise.all([
      loadSettings(),
      getVersion().catch(() => "unknown"),
    ]);

    return {
      settings,
      appVersion,
    };
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await setAfkTimeout(value as number);
    }
  }

  static async clearSessionsByRange(range: CleanupRange, nowMs: number = Date.now()): Promise<void> {
    const cutoffTime = resolveCleanupCutoffTime(range, nowMs);
    await clearSessionsBefore(cutoffTime);
  }

  static async exportBackupWithPicker(initialPath?: string): Promise<string | null> {
    const selectedPath = await pickBackupSaveFile(initialPath);
    if (!selectedPath) {
      return null;
    }

    return exportBackup(selectedPath);
  }

  static async prepareBackupRestore(initialPath?: string): Promise<BackupRestorePreparation | null> {
    const selectedPath = await pickBackupFile(initialPath);
    if (!selectedPath) {
      return null;
    }

    const preview = await previewBackup(selectedPath);
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
    await restoreBackup(path);
  }
}
