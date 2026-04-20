import {
  clearSessionsBefore,
  saveAppSetting,
  type AppSettings,
} from "../../../platform/persistence/appSettingsStore.ts";
import {
  exportBackup,
  pickBackupFile,
  pickBackupSaveFile,
  previewBackup,
  restoreBackup,
  type BackupPreview,
} from "../../../platform/backup/backupRuntimeGateway.ts";
import { openExternalUrl } from "../../../platform/desktop/externalUrlGateway.ts";
import { setAfkThreshold } from "../../../platform/runtime/trackingRuntimeGateway.ts";
import type { CleanupRange } from "../types.ts";
import {
  buildSessionCleanupPlan,
  clearSessionsByRangeWithDeps,
} from "./sessionCleanupPolicy.ts";

export type { BackupPreview } from "../../../platform/backup/backupRuntimeGateway.ts";

export interface BackupRestorePreparation {
  path: string;
  preview: BackupPreview;
  previewSummary: string;
  compatible: boolean;
  incompatibilityMessage?: string;
}

type SettingsPatch = Partial<AppSettings>;
type ExportBackupDeps = {
  pickBackupSaveFile: (initialPath?: string) => Promise<string | null>;
  exportBackup: (path: string) => Promise<string>;
};
type PrepareBackupRestoreDeps = {
  pickBackupFile: (initialPath?: string) => Promise<string | null>;
  previewBackup: (path: string) => Promise<BackupPreview>;
};

const RELEASE_NOTES_URL = "https://github.com/182376/time-tracking/releases";
const FEEDBACK_URL = "https://github.com/182376/time-tracking/issues/new/choose";

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

const exportBackupDeps: ExportBackupDeps = {
  pickBackupSaveFile,
  exportBackup,
};

const prepareBackupRestoreDeps: PrepareBackupRestoreDeps = {
  pickBackupFile,
  previewBackup,
};

export async function exportBackupWithPickerWithDeps(
  initialPath: string | undefined,
  deps: ExportBackupDeps,
): Promise<string | null> {
  const selectedPath = await deps.pickBackupSaveFile(initialPath);
  if (!selectedPath) {
    return null;
  }

  return deps.exportBackup(selectedPath);
}

export async function prepareBackupRestoreWithDeps(
  initialPath: string | undefined,
  deps: PrepareBackupRestoreDeps,
): Promise<BackupRestorePreparation | null> {
  const selectedPath = await deps.pickBackupFile(initialPath);
  if (!selectedPath) {
    return null;
  }

  const preview = await deps.previewBackup(selectedPath);
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

export class SettingsRuntimeAdapterService {
  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await saveAppSetting(key, value);

    if (key === "timeline_merge_gap_secs") {
      await setAfkThreshold(value as number);
    }
  }

  static async clearSessionsByRange(range: CleanupRange, nowMs: number = Date.now()): Promise<void> {
    const cleanupPlan = buildSessionCleanupPlan(range, nowMs);
    await clearSessionsByRangeWithDeps(cleanupPlan.range, cleanupPlan.nowMs, {
      clearSessionsBefore,
    });
  }

  static async exportBackupWithPicker(initialPath?: string): Promise<string | null> {
    return exportBackupWithPickerWithDeps(initialPath, exportBackupDeps);
  }

  static async prepareBackupRestore(initialPath?: string): Promise<BackupRestorePreparation | null> {
    return prepareBackupRestoreWithDeps(initialPath, prepareBackupRestoreDeps);
  }

  static async restoreBackup(path: string): Promise<void> {
    await restoreBackup(path);
  }

  static async openReleaseNotes(): Promise<void> {
    await openExternalUrl(RELEASE_NOTES_URL);
  }

  static async openFeedback(): Promise<void> {
    await openExternalUrl(FEEDBACK_URL);
  }

  static buildSettingsPatch(
    saved: AppSettings,
    draft: AppSettings,
  ): SettingsPatch {
    const patch: SettingsPatch = {};
    const patchRecord = patch as Record<keyof AppSettings, AppSettings[keyof AppSettings]>;
    const keys = Object.keys(saved) as Array<keyof AppSettings>;
    for (const key of keys) {
      if (saved[key] !== draft[key]) {
        patchRecord[key] = draft[key];
      }
    }
    return patch;
  }

  static async commitSettingsPatch(patch: SettingsPatch): Promise<void> {
    const entries = Object.entries(patch) as Array<[keyof AppSettings, AppSettings[keyof AppSettings]]>;
    for (const [key, value] of entries) {
      await saveAppSetting(key, value);
      if (key === "timeline_merge_gap_secs") {
        await setAfkThreshold(value as number);
      }
    }
  }
}
