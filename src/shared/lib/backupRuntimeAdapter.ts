import { invoke } from "@tauri-apps/api/core";

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

export async function exportBackup(path?: string): Promise<string> {
  return invoke<string>("cmd_export_backup", { backupPath: path ?? null });
}

export async function restoreBackup(path: string): Promise<void> {
  await invoke("cmd_restore_backup", { backupPath: path });
}

export async function previewBackup(path: string): Promise<BackupPreview> {
  return invoke<BackupPreview>("cmd_preview_backup", { backupPath: path });
}

export async function pickBackupSaveFile(initialPath?: string): Promise<string | null> {
  return invoke<string | null>("cmd_pick_backup_save_file", { initialPath: initialPath ?? null });
}

export async function pickBackupFile(initialPath?: string): Promise<string | null> {
  return invoke<string | null>("cmd_pick_backup_file", { initialPath: initialPath ?? null });
}
