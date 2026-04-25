import { invoke } from "@tauri-apps/api/core";

interface RawBackupPreview {
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

export interface BackupPreview {
  version: number;
  exportedAtMs: number;
  schemaVersion: number;
  appVersion: string;
  compatibilityLevel: string;
  compatibilityMessage: string;
  sessionCount: number;
  settingCount: number;
  iconCacheCount: number;
}

function isRawBackupPreview(value: unknown): value is RawBackupPreview {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.version === "number"
    && typeof record.exported_at_ms === "number"
    && typeof record.schema_version === "number"
    && typeof record.app_version === "string"
    && typeof record.compatibility_level === "string"
    && typeof record.compatibility_message === "string"
    && typeof record.session_count === "number"
    && typeof record.setting_count === "number"
    && typeof record.icon_cache_count === "number";
}

function mapRawBackupPreview(raw: RawBackupPreview): BackupPreview {
  return {
    version: raw.version,
    exportedAtMs: raw.exported_at_ms,
    schemaVersion: raw.schema_version,
    appVersion: raw.app_version,
    compatibilityLevel: raw.compatibility_level,
    compatibilityMessage: raw.compatibility_message,
    sessionCount: raw.session_count,
    settingCount: raw.setting_count,
    iconCacheCount: raw.icon_cache_count,
  };
}

function parseBackupPreview(value: unknown): BackupPreview {
  if (!isRawBackupPreview(value)) {
    throw new Error("Received invalid backup preview payload");
  }
  return mapRawBackupPreview(value);
}

export async function exportBackup(path?: string): Promise<string> {
  return invoke<string>("cmd_export_backup", { backupPath: path ?? null });
}

export async function restoreBackup(path: string): Promise<void> {
  await invoke("cmd_restore_backup", { backupPath: path });
}

export async function previewBackup(path: string): Promise<BackupPreview> {
  const payload = await invoke<unknown>("cmd_preview_backup", { backupPath: path });
  return parseBackupPreview(payload);
}

export async function pickBackupSaveFile(initialPath?: string): Promise<string | null> {
  return invoke<string | null>("cmd_pick_backup_save_file", { initialPath: initialPath ?? null });
}

export async function pickBackupFile(initialPath?: string): Promise<string | null> {
  return invoke<string | null>("cmd_pick_backup_file", { initialPath: initialPath ?? null });
}
