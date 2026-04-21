import {
  Save,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import type { SettingsPageProps } from "../types";
import QuietPageHeader from "../../../shared/components/QuietPageHeader";
import SettingsDataSafetyPanel from "./SettingsDataSafetyPanel";
import SettingsAboutPanel from "./SettingsAboutPanel";
import SettingsResidentPanel from "./SettingsResidentPanel";
import SettingsTrackingPanel from "./SettingsTrackingPanel";
import { useSettingsPageState } from "../hooks/useSettingsPageState";

export default function Settings({
  onSettingsChanged,
  onCheckForUpdates,
  onOpenUpdateDialog,
  onOpenUpdateReleasePage,
  onOpenUpdateDownload,
  updateSnapshot,
  updateChecking,
  updateInstalling,
  updateDialogOpen,
  onDirtyChange,
  onToast,
  onRegisterSaveHandler,
}: SettingsPageProps) {
  const {
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
    cleanupOptions,
    minimizeBehaviorDefault,
    minimizeBehaviorAlternate,
    closeBehaviorDefault,
    closeBehaviorAlternate,
    idleTimeoutMinutesRange,
    timelineMergeGapMinutesRange,
    minSessionMinutesRange,
  } = useSettingsPageState({
    onSettingsChanged,
    onDirtyChange,
    onToast,
    onRegisterSaveHandler,
  });

  if (loading || !savedSettings || !draftSettings) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] gap-3">
        <RefreshCw className="animate-spin" size={20} />
        <span className="text-sm font-medium">{UI_TEXT.settings.loading}</span>
      </div>
    );
  }

  const effectiveUpdateSnapshot = updateSnapshot ?? {
    current_version: appVersion,
    status: "idle",
    latest_version: null,
    release_notes: null,
    release_date: null,
    error_message: null,
    error_stage: null,
    downloaded_bytes: null,
    total_bytes: null,
    release_page_url: null,
    asset_download_url: null,
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
            timelineMergeGapControl={{
              label: UI_TEXT.settings.timelineMergeGapLabel,
              hint: UI_TEXT.settings.timelineMergeGapHint,
              minutes: timelineMergeGapMinutes,
              minMinutes: timelineMergeGapMinutesRange.min,
              maxMinutes: timelineMergeGapMinutesRange.max,
              onMinutesChange: (nextMinutes) => handleChange("timeline_merge_gap_secs", nextMinutes * 60),
            }}
            idleTimeoutControl={{
              label: UI_TEXT.settings.idleTimeoutLabel,
              hint: UI_TEXT.settings.idleTimeoutHint,
              minutes: idleTimeoutMinutes,
              minMinutes: idleTimeoutMinutesRange.min,
              maxMinutes: idleTimeoutMinutesRange.max,
              onMinutesChange: (nextMinutes) => handleChange("idle_timeout_secs", nextMinutes * 60),
            }}
            minSessionControl={{
              label: UI_TEXT.settings.minSessionLabel,
              hint: UI_TEXT.settings.minSessionHint,
              minutes: minSessionMinutes,
              minMinutes: minSessionMinutesRange.min,
              maxMinutes: minSessionMinutesRange.max,
              onMinutesChange: (nextMinutes) => handleChange("min_session_secs", nextMinutes * 60),
            }}
            trackingPaused={draftSettings.tracking_paused}
            onTrackingPausedChange={(nextChecked) => handleChange("tracking_paused", nextChecked)}
          />

          <SettingsResidentPanel
            minimizeToWidgetChecked={draftSettings.minimize_behavior !== minimizeBehaviorDefault}
            onMinimizeToWidgetChange={(nextChecked) => {
              handleChange(
                "minimize_behavior",
                nextChecked ? minimizeBehaviorAlternate : minimizeBehaviorDefault,
              );
            }}
            closeToTrayChecked={draftSettings.close_behavior !== closeBehaviorDefault}
            onCloseToTrayChange={(nextChecked) => {
              handleChange(
                "close_behavior",
                nextChecked ? closeBehaviorAlternate : closeBehaviorDefault,
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
            cleanupOptions={cleanupOptions}
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
            updateDialogOpen={updateDialogOpen ?? false}
            onCheckForUpdates={() => {
              if (!onCheckForUpdates) return;
              void onCheckForUpdates();
            }}
            onOpenUpdateDialog={() => onOpenUpdateDialog?.()}
            onOpenUpdateReleasePage={() => {
              if (!onOpenUpdateReleasePage) return;
              void onOpenUpdateReleasePage();
            }}
            onOpenUpdateDownload={() => {
              if (!onOpenUpdateDownload) return;
              void onOpenUpdateDownload();
            }}
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
