import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import type { QuietToastTone } from "../../../shared/components/QuietToast";
import type { CleanupRange } from "../types.ts";
import type { BackupRestorePreparation } from "./settingsRuntimeAdapterService.ts";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
}

type ConfirmAction = (options: ConfirmOptions) => Promise<boolean>;
type NotifyAction = (message: string, tone?: QuietToastTone) => void;
type BusyHook = () => void;
type ErrorReporter = (message: string, error: unknown) => void;

type CleanupFlowOptions = {
  cleanupRange: CleanupRange;
  cleanupRangeLabel: string;
  confirm: ConfirmAction;
  clearSessionsByRange: (range: CleanupRange) => Promise<void>;
  notify: NotifyAction;
  reload: () => void;
  onExecutionStart?: BusyHook;
  onExecutionEnd?: BusyHook;
  reportError?: ErrorReporter;
};

type BackupExportFlowOptions = {
  initialPath?: string;
  exportBackupWithPicker: (initialPath?: string) => Promise<string | null>;
  setExportPath: (path: string) => void;
  notify: NotifyAction;
  onExecutionStart?: BusyHook;
  onExecutionEnd?: BusyHook;
  reportError?: ErrorReporter;
};

type BackupRestoreFlowOptions = {
  initialPath?: string;
  prepareBackupRestore: (initialPath?: string) => Promise<BackupRestorePreparation | null>;
  setRestorePath: (path: string) => void;
  confirm: ConfirmAction;
  restoreBackup: (path: string) => Promise<void>;
  notify: NotifyAction;
  reload: () => void;
  onExecutionStart?: BusyHook;
  onExecutionEnd?: BusyHook;
  reportError?: ErrorReporter;
};

function normalizeOptionalPath(path: string | undefined): string | undefined {
  const trimmed = path?.trim();
  return trimmed ? trimmed : undefined;
}

export async function runSettingsCleanupFlow(options: CleanupFlowOptions): Promise<boolean> {
  const confirmed = await options.confirm({
    title: UI_TEXT.settings.cleanupConfirmTitle,
    description: UI_TEXT.settings.cleanupConfirmDetail(options.cleanupRangeLabel),
    confirmLabel: UI_TEXT.dialog.confirmDanger,
    danger: true,
  });
  if (!confirmed) {
    return false;
  }

  options.onExecutionStart?.();
  try {
    await options.clearSessionsByRange(options.cleanupRange);
    options.notify("历史数据已清理。", "success");
    options.reload();
    return true;
  } catch (error) {
    options.reportError?.("cleanup failed", error);
    options.notify("历史数据清理失败，请稍后重试。", "warning");
    return false;
  } finally {
    options.onExecutionEnd?.();
  }
}

export async function runBackupExportFlow(options: BackupExportFlowOptions): Promise<string | null> {
  options.onExecutionStart?.();
  try {
    const exportedPath = await options.exportBackupWithPicker(normalizeOptionalPath(options.initialPath));
    if (!exportedPath) {
      return null;
    }

    options.setExportPath(exportedPath);
    options.notify(`备份导出成功：${exportedPath}`, "success");
    return exportedPath;
  } catch (error) {
    options.reportError?.("export backup failed", error);
    options.notify("备份导出失败，请检查路径后重试。", "warning");
    return null;
  } finally {
    options.onExecutionEnd?.();
  }
}

export async function runBackupRestoreFlow(options: BackupRestoreFlowOptions): Promise<boolean> {
  let preparation: BackupRestorePreparation | null = null;
  try {
    preparation = await options.prepareBackupRestore(normalizeOptionalPath(options.initialPath));
    if (!preparation) {
      return false;
    }

    options.setRestorePath(preparation.path);
    if (!preparation.compatible) {
      options.notify(`备份不兼容：${preparation.incompatibilityMessage ?? "未知原因"}`, "warning");
      return false;
    }
  } catch (error) {
    options.reportError?.("prepare backup restore failed", error);
    options.notify("备份文件预览失败，无法确认覆盖范围。", "warning");
    return false;
  }

  if (!preparation || !preparation.compatible) {
    return false;
  }

  const confirmed = await options.confirm({
    title: UI_TEXT.settings.restoreConfirmTitle,
    description: UI_TEXT.settings.restoreConfirmDetail(preparation.path, preparation.previewSummary),
    confirmLabel: UI_TEXT.dialog.confirmDanger,
    danger: true,
  });
  if (!confirmed) {
    return false;
  }

  options.onExecutionStart?.();
  try {
    await options.restoreBackup(preparation.path);
    options.notify("备份恢复成功，正在刷新界面。", "success");
    options.reload();
    return true;
  } catch (error) {
    options.reportError?.("restore backup failed", error);
    options.notify("备份恢复失败，已自动回滚，不会破坏当前数据。", "warning");
    return false;
  } finally {
    options.onExecutionEnd?.();
  }
}
