import { useCallback, useEffect, useRef, useState } from "react";
import {
  Save,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import { DEFAULT_SETTINGS, type AppSettings } from "../../../shared/settings/appSettings";
import { SettingsRuntimeAdapterService } from "../services/settingsRuntimeAdapterService";
import type { SettingsPageProps, CleanupRange } from "../types";
import type { ToastTone } from "../../../shared/components/ToastStack";
import { useQuietDialogs } from "../../../shared/hooks/useQuietDialogs";
import QuietPageHeader from "../../../shared/components/QuietPageHeader";
import { getSettingsBootstrapCache, setSettingsBootstrapCache } from "../services/settingsBootstrapCache";
import SettingsDataSafetyPanel from "./SettingsDataSafetyPanel";
import SettingsAboutPanel from "./SettingsAboutPanel";
import SettingsResidentPanel from "./SettingsResidentPanel";
import SettingsTrackingPanel from "./SettingsTrackingPanel";

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
const IDLE_TIMEOUT_MINUTES_RANGE = { min: 1, max: 30 } as const;
const TIMELINE_MERGE_GAP_MINUTES_RANGE = { min: 1, max: 5 } as const;
const MIN_SESSION_MINUTES_RANGE = { min: 1, max: 10 } as const;
const clampMinute = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const secondsToMinute = (seconds: number, min: number, max: number) =>
  clampMinute(Math.round(seconds / 60), min, max);

export default function Settings({
  onSettingsChanged,
  onCheckForUpdates,
  onOpenUpdateDialog,
  updateSnapshot,
  updateChecking,
  updateInstalling,
  onDirtyChange,
  onToast,
  onRegisterSaveHandler,
}: SettingsPageProps) {
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

  const notify = (message: string, tone: ToastTone = "info") => {
    onToast?.(message, tone);
  };

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

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraftSettings((current) => {
      if (!current) return current;
      const nextDraft = { ...current, [key]: value } as AppSettings;
      if (key === "launch_at_login" && value === false) {
        nextDraft.start_minimized = false;
      }
      return nextDraft;
    });
  };

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
  }, [draftSettings, hasUnsavedChanges, notify, onSettingsChanged, saveStatus, savedSettings]);

  useEffect(() => {
    onRegisterSaveHandler?.(handleSave);
    return () => {
      onRegisterSaveHandler?.(null);
    };
  }, [handleSave, onRegisterSaveHandler]);

  const handleCancel = () => {
    if (!savedSettings || !hasUnsavedChanges) return;
    setDraftSettings(savedSettings);
    setSaveStatus("idle");
    notify(UI_TEXT.settings.cancelled, "info");
  };

  const handleCleanup = async () => {
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
  };

  const handleExportBackup = async () => {
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
  };

  const handleRestoreBackup = async () => {
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
  };

  const handleOpenReleaseNotes = async () => {
    try {
      await SettingsRuntimeAdapterService.openReleaseNotes();
    } catch (error) {
      console.error("open release notes failed", error);
      notify("无法打开更新说明链接。", "warning");
    }
  };

  const handleOpenFeedback = async () => {
    try {
      await SettingsRuntimeAdapterService.openFeedback();
    } catch (error) {
      console.error("open feedback link failed", error);
      notify("无法打开反馈链接。", "warning");
    }
  };

  if (loading || !savedSettings || !draftSettings) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] gap-3">
        <RefreshCw className="animate-spin" size={20} />
        <span className="text-sm font-medium">{UI_TEXT.settings.loading}</span>
      </div>
    );
  }

  const idleTimeoutMinutes = secondsToMinute(
    draftSettings.idle_timeout_secs,
    IDLE_TIMEOUT_MINUTES_RANGE.min,
    IDLE_TIMEOUT_MINUTES_RANGE.max,
  );
  const timelineMergeGapMinutes = secondsToMinute(
    draftSettings.timeline_merge_gap_secs,
    TIMELINE_MERGE_GAP_MINUTES_RANGE.min,
    TIMELINE_MERGE_GAP_MINUTES_RANGE.max,
  );
  const minSessionMinutes = secondsToMinute(
    draftSettings.min_session_secs,
    MIN_SESSION_MINUTES_RANGE.min,
    MIN_SESSION_MINUTES_RANGE.max,
  );
  const effectiveUpdateSnapshot = updateSnapshot ?? {
    current_version: appVersion,
    status: "idle",
    latest_version: null,
    release_notes: null,
    release_date: null,
    error_message: null,
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-4 md:gap-5">
      {dialogs}
      <QuietPageHeader
        icon={<Settings2 size={18} />}
        title={UI_TEXT.settings.title}
        subtitle={UI_TEXT.settings.subtitle}
        rightSlot={(
          <div className="flex items-center gap-2.5">
            <div className="qp-status flex px-3 py-1.5 rounded-[8px] items-center text-xs font-semibold">
              {saveStatus === "saving" && (
                <span className="text-[var(--qp-accent-default)] flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" />
                  {UI_TEXT.settings.saving}
                </span>
              )}
              {saveStatus === "saved" && !hasUnsavedChanges && (
                <span className="text-[var(--qp-success)] flex items-center gap-1.5">
                  <Save size={14} />
                  {UI_TEXT.settings.saved}
                </span>
              )}
              {saveStatus !== "saving" && hasUnsavedChanges && (
                <span className="text-[var(--qp-warning)]">{UI_TEXT.settings.unsaved}</span>
              )}
              {saveStatus === "idle" && !hasUnsavedChanges && (
                <span className="text-[var(--qp-text-tertiary)]">{UI_TEXT.settings.idle}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={!hasUnsavedChanges || saveStatus === "saving"}
              className="qp-button-secondary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {UI_TEXT.settings.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasUnsavedChanges || saveStatus === "saving"}
              className="qp-button-primary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveStatus === "saving" ? UI_TEXT.settings.saving : UI_TEXT.settings.save}
            </button>
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 gap-4 md:gap-5">
          <SettingsTrackingPanel
            idleTimeoutControl={{
              label: UI_TEXT.settings.idleTimeoutLabel,
              hint: UI_TEXT.settings.idleTimeoutHint,
              minutes: idleTimeoutMinutes,
              minMinutes: IDLE_TIMEOUT_MINUTES_RANGE.min,
              maxMinutes: IDLE_TIMEOUT_MINUTES_RANGE.max,
              onMinutesChange: (nextMinutes) => handleChange("idle_timeout_secs", nextMinutes * 60),
            }}
            timelineMergeGapControl={{
              label: UI_TEXT.settings.timelineMergeGapLabel,
              hint: UI_TEXT.settings.timelineMergeGapHint,
              minutes: timelineMergeGapMinutes,
              minMinutes: TIMELINE_MERGE_GAP_MINUTES_RANGE.min,
              maxMinutes: TIMELINE_MERGE_GAP_MINUTES_RANGE.max,
              onMinutesChange: (nextMinutes) => handleChange("timeline_merge_gap_secs", nextMinutes * 60),
            }}
            minSessionControl={{
              label: UI_TEXT.settings.minSessionLabel,
              hint: UI_TEXT.settings.minSessionHint,
              minutes: minSessionMinutes,
              minMinutes: MIN_SESSION_MINUTES_RANGE.min,
              maxMinutes: MIN_SESSION_MINUTES_RANGE.max,
              onMinutesChange: (nextMinutes) => handleChange("min_session_secs", nextMinutes * 60),
            }}
            trackingPaused={draftSettings.tracking_paused}
            onTrackingPausedChange={(nextChecked) => handleChange("tracking_paused", nextChecked)}
          />

          <SettingsResidentPanel
            minimizeToTrayChecked={draftSettings.minimize_behavior !== MINIMIZE_BEHAVIOR_DEFAULT}
            onMinimizeToTrayChange={(nextChecked) => {
              handleChange(
                "minimize_behavior",
                nextChecked ? MINIMIZE_BEHAVIOR_ALTERNATE : MINIMIZE_BEHAVIOR_DEFAULT,
              );
            }}
            closeToTrayChecked={draftSettings.close_behavior !== CLOSE_BEHAVIOR_DEFAULT}
            onCloseToTrayChange={(nextChecked) => {
              handleChange(
                "close_behavior",
                nextChecked ? CLOSE_BEHAVIOR_ALTERNATE : CLOSE_BEHAVIOR_DEFAULT,
              );
            }}
            launchAtLoginChecked={draftSettings.launch_at_login}
            onLaunchAtLoginChange={(nextChecked) => handleChange("launch_at_login", nextChecked)}
            startMinimizedChecked={draftSettings.start_minimized}
            startMinimizedDisabled={!draftSettings.launch_at_login}
            onStartMinimizedChange={(nextChecked) => handleChange("start_minimized", nextChecked)}
          />

          <SettingsDataSafetyPanel
            cleanupRange={cleanupRange}
            cleanupOptions={CLEANUP_OPTIONS}
            isCleaning={isCleaning}
            isExportingBackup={isExportingBackup}
            isRestoringBackup={isRestoringBackup}
            onCleanupRangeChange={setCleanupRange}
            onCleanup={handleCleanup}
            onExportBackup={() => void handleExportBackup()}
            onRestoreBackup={() => void handleRestoreBackup()}
          />
          <SettingsAboutPanel
            appVersion={appVersion}
            effectiveUpdateSnapshot={effectiveUpdateSnapshot}
            updateChecking={updateChecking ?? false}
            updateInstalling={updateInstalling ?? false}
            onCheckForUpdates={() => {
              if (!onCheckForUpdates) return;
              void onCheckForUpdates();
            }}
            onOpenUpdateDialog={() => onOpenUpdateDialog?.()}
            onOpenReleaseNotes={() => {
              void handleOpenReleaseNotes();
            }}
            onOpenFeedback={() => {
              void handleOpenFeedback();
            }}
          />
        </div>
      </div>
    </div>
  );
}
