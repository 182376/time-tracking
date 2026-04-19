import { useCallback, useEffect, useRef, useState } from "react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import type { ToastTone } from "../../../shared/components/ToastStack";
import { useQuietDialogs } from "../../../shared/hooks/useQuietDialogs";
import { getSettingsBootstrapCache, setSettingsBootstrapCache } from "../services/settingsBootstrapCache";
import { SettingsRuntimeAdapterService } from "../services/settingsRuntimeAdapterService";
import { DEFAULT_SETTINGS, type AppSettings } from "../../../shared/settings/appSettings";
import type { CleanupRange } from "../types";

const CLEANUP_OPTIONS: Array<{ value: CleanupRange; label: string }> = [
  { value: 180, label: UI_TEXT.settings.cleanupRangeLabels[180] },
  { value: 90, label: UI_TEXT.settings.cleanupRangeLabels[90] },
  { value: 60, label: UI_TEXT.settings.cleanupRangeLabels[60] },
  { value: 30, label: UI_TEXT.settings.cleanupRangeLabels[30] },
  { value: 15, label: UI_TEXT.settings.cleanupRangeLabels[15] },
  { value: 7, label: UI_TEXT.settings.cleanupRangeLabels[7] },
];

const MINIMIZE_BEHAVIOR_DEFAULT = DEFAULT_SETTINGS.minimize_behavior;
const MINIMIZE_BEHAVIOR_ALTERNATE: AppSettings["minimize_behavior"] =
  MINIMIZE_BEHAVIOR_DEFAULT === "taskbar" ? "tray" : "taskbar";
const CLOSE_BEHAVIOR_DEFAULT = DEFAULT_SETTINGS.close_behavior;
const CLOSE_BEHAVIOR_ALTERNATE: AppSettings["close_behavior"] =
  CLOSE_BEHAVIOR_DEFAULT === "tray" ? "exit" : "tray";
const IDLE_TIMEOUT_MINUTES_RANGE = { min: 5, max: 30 } as const;
const TIMELINE_MERGE_GAP_MINUTES_RANGE = { min: 1, max: 5 } as const;
const MIN_SESSION_MINUTES_RANGE = { min: 1, max: 10 } as const;

const clampMinute = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const secondsToMinute = (seconds: number, min: number, max: number) =>
  clampMinute(Math.round(seconds / 60), min, max);

export interface UseSettingsPageStateOptions {
  onSettingsChanged: (settings: AppSettings) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
}

export function useSettingsPageState({
  onSettingsChanged,
  onDirtyChange,
  onToast,
  onRegisterSaveHandler,
}: UseSettingsPageStateOptions) {
  const { confirm, dialogs } = useQuietDialogs();
  const initialBootstrap = getSettingsBootstrapCache();
  const initialBootstrapRef = useRef(initialBootstrap);
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(
    () => (initialBootstrap ? { ...initialBootstrap.settings } : null),
  );
  const [draftSettings, setDraftSettings] = useState<AppSettings | null>(
    () => (initialBootstrap ? { ...initialBootstrap.settings } : null),
  );
  const [loading, setLoading] = useState(() => !initialBootstrap);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [cleanupRange, setCleanupRange] = useState<CleanupRange>(30);
  const [isCleaning, setIsCleaning] = useState(false);
  const [exportPath, setExportPath] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [appVersion, setAppVersion] = useState(() => initialBootstrap?.appVersion ?? "-");
  const hasUnsavedChangesRef = useRef(false);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    onToast?.(message, tone);
  }, [onToast]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const hadCacheAtStart = Boolean(initialBootstrapRef.current);
      if (!hadCacheAtStart) {
        setLoading(true);
      }
      try {
        const bootstrap = await SettingsRuntimeAdapterService.loadBootstrap();
        setSettingsBootstrapCache({
          settings: { ...bootstrap.settings },
          appVersion: bootstrap.appVersion,
        });
        if (cancelled) return;
        if (!hasUnsavedChangesRef.current) {
          setSavedSettings({ ...bootstrap.settings });
          setDraftSettings({ ...bootstrap.settings });
        }
        setAppVersion(bootstrap.appVersion);
      } catch (error) {
        console.error("load settings bootstrap failed", error);
      } finally {
        if (!cancelled && !hadCacheAtStart) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasUnsavedChanges = (() => {
    if (!savedSettings || !draftSettings) {
      return false;
    }
    const keys = Object.keys(savedSettings) as Array<keyof AppSettings>;
    return keys.some((key) => savedSettings[key] !== draftSettings[key]);
  })();

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => () => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  const handleChange = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraftSettings((current) => {
      if (!current) return current;
      const nextDraft = { ...current, [key]: value } as AppSettings;
      if (key === "launch_at_login" && value === false) {
        nextDraft.start_minimized = false;
      }
      return nextDraft;
    });
  }, []);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!savedSettings || !draftSettings) return false;
    if (!hasUnsavedChanges) return true;
    if (saveStatus === "saving") return false;
    setSaveStatus("saving");
    try {
      const patch = SettingsRuntimeAdapterService.buildSettingsPatch(savedSettings, draftSettings);
      await SettingsRuntimeAdapterService.commitSettingsPatch(patch);
      setSavedSettings(draftSettings);
      setSettingsBootstrapCache({
        settings: { ...draftSettings },
        appVersion,
      });
      onSettingsChanged(draftSettings);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1800);
      notify(UI_TEXT.settings.saved, "success");
      return true;
    } catch (error) {
      console.error("save settings failed", error);
      setSaveStatus("idle");
      notify(UI_TEXT.settings.saveFailed, "warning");
      return false;
    }
  }, [appVersion, draftSettings, hasUnsavedChanges, notify, onSettingsChanged, saveStatus, savedSettings]);

  useEffect(() => {
    onRegisterSaveHandler?.(handleSave);
    return () => {
      onRegisterSaveHandler?.(null);
    };
  }, [handleSave, onRegisterSaveHandler]);

  const handleCancel = useCallback(() => {
    if (!savedSettings || !hasUnsavedChanges) return;
    setDraftSettings(savedSettings);
    setSaveStatus("idle");
    notify(UI_TEXT.settings.cancelled, "info");
  }, [hasUnsavedChanges, notify, savedSettings]);

  const handleCleanup = useCallback(async () => {
    const selectedLabel = CLEANUP_OPTIONS.find((option) => option.value === cleanupRange)?.label
      ?? UI_TEXT.settings.confirmRangeFallback;
    const confirmed = await confirm({
      title: UI_TEXT.settings.cleanupConfirmTitle,
      description: UI_TEXT.settings.cleanupConfirmDetail(selectedLabel),
      confirmLabel: UI_TEXT.dialog.confirmDanger,
      danger: true,
    });
    if (!confirmed) return;

    setIsCleaning(true);
    try {
      await SettingsRuntimeAdapterService.clearSessionsByRange(cleanupRange);
      notify("历史数据已清理。", "success");
      window.location.reload();
    } catch (error) {
      console.error("cleanup failed", error);
      notify("历史数据清理失败，请稍后重试。", "warning");
    } finally {
      setIsCleaning(false);
    }
  }, [cleanupRange, confirm, notify]);

  const handleExportBackup = useCallback(async () => {
    if (isExportingBackup) return;

    setIsExportingBackup(true);

    try {
      const exportedPath = await SettingsRuntimeAdapterService.exportBackupWithPicker(exportPath.trim() || undefined);
      if (!exportedPath) return;
      setExportPath(exportedPath);
      notify(`备份导出成功：${exportedPath}`, "success");
    } catch (error) {
      console.error("export backup failed", error);
      notify("备份导出失败，请检查路径后重试。", "warning");
    } finally {
      setIsExportingBackup(false);
    }
  }, [exportPath, isExportingBackup, notify]);

  const handleRestoreBackup = useCallback(async () => {
    if (isRestoringBackup) return;

    let preparation: Awaited<ReturnType<typeof SettingsRuntimeAdapterService.prepareBackupRestore>> = null;
    try {
      preparation = await SettingsRuntimeAdapterService.prepareBackupRestore(restorePath.trim() || undefined);
      if (!preparation) return;
      setRestorePath(preparation.path);
      if (!preparation.compatible) {
        notify(`备份不兼容：${preparation.incompatibilityMessage ?? "未知原因"}`, "warning");
        return;
      }
    } catch (error) {
      console.error("prepare backup restore failed", error);
      notify("备份文件预览失败，无法确认覆盖范围。", "warning");
      return;
    }
    if (!preparation || !preparation.compatible) return;

    const confirmed = await confirm({
      title: UI_TEXT.settings.restoreConfirmTitle,
      description: UI_TEXT.settings.restoreConfirmDetail(preparation.path, preparation.previewSummary),
      confirmLabel: UI_TEXT.dialog.confirmDanger,
      danger: true,
    });
    if (!confirmed) return;

    setIsRestoringBackup(true);
    try {
      await SettingsRuntimeAdapterService.restoreBackup(preparation.path);
      notify("备份恢复成功，正在刷新界面。", "success");
      window.location.reload();
    } catch (error) {
      console.error("restore backup failed", error);
      notify("备份恢复失败，已自动回滚，不会破坏当前数据。", "warning");
    } finally {
      setIsRestoringBackup(false);
    }
  }, [confirm, isRestoringBackup, notify, restorePath]);

  const handleOpenReleaseNotes = useCallback(async () => {
    try {
      await SettingsRuntimeAdapterService.openReleaseNotes();
    } catch (error) {
      console.error("open release notes failed", error);
      notify("无法打开更新说明链接。", "warning");
    }
  }, [notify]);

  const handleOpenFeedback = useCallback(async () => {
    try {
      await SettingsRuntimeAdapterService.openFeedback();
    } catch (error) {
      console.error("open feedback link failed", error);
      notify("无法打开反馈链接。", "warning");
    }
  }, [notify]);

  const idleTimeoutMinutes = draftSettings
    ? secondsToMinute(
      draftSettings.idle_timeout_secs,
      IDLE_TIMEOUT_MINUTES_RANGE.min,
      IDLE_TIMEOUT_MINUTES_RANGE.max,
    )
    : IDLE_TIMEOUT_MINUTES_RANGE.min;
  const timelineMergeGapMinutes = draftSettings
    ? secondsToMinute(
      draftSettings.timeline_merge_gap_secs,
      TIMELINE_MERGE_GAP_MINUTES_RANGE.min,
      TIMELINE_MERGE_GAP_MINUTES_RANGE.max,
    )
    : TIMELINE_MERGE_GAP_MINUTES_RANGE.min;
  const minSessionMinutes = draftSettings
    ? secondsToMinute(
      draftSettings.min_session_secs,
      MIN_SESSION_MINUTES_RANGE.min,
      MIN_SESSION_MINUTES_RANGE.max,
    )
    : MIN_SESSION_MINUTES_RANGE.min;

  return {
    dialogs,
    loading,
    savedSettings,
    draftSettings,
    appVersion,
    saveStatus,
    hasUnsavedChanges,
    handleCancel,
    handleSave,
    handleChange,
    cleanupRange,
    setCleanupRange,
    isCleaning,
    isExportingBackup,
    isRestoringBackup,
    handleCleanup,
    handleExportBackup,
    handleRestoreBackup,
    handleOpenReleaseNotes,
    handleOpenFeedback,
    idleTimeoutMinutes,
    timelineMergeGapMinutes,
    minSessionMinutes,
    cleanupOptions: CLEANUP_OPTIONS,
    minimizeBehaviorDefault: MINIMIZE_BEHAVIOR_DEFAULT,
    minimizeBehaviorAlternate: MINIMIZE_BEHAVIOR_ALTERNATE,
    closeBehaviorDefault: CLOSE_BEHAVIOR_DEFAULT,
    closeBehaviorAlternate: CLOSE_BEHAVIOR_ALTERNATE,
    idleTimeoutMinutesRange: IDLE_TIMEOUT_MINUTES_RANGE,
    timelineMergeGapMinutesRange: TIMELINE_MERGE_GAP_MINUTES_RANGE,
    minSessionMinutesRange: MIN_SESSION_MINUTES_RANGE,
  };
}
