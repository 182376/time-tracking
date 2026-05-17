import { useState } from "react";
import { Database, FileArchive, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import QuietDangerAction from "../../../shared/components/QuietDangerAction";
import QuietSubpanel from "../../../shared/components/QuietSubpanel";
import QuietActionRow from "../../../shared/components/QuietActionRow";
import QuietSelect from "../../../shared/components/QuietSelect";
import QuietSegmentedFilter from "../../../shared/components/QuietSegmentedFilter";
import QuietDialog from "../../../shared/components/QuietDialog";
import type { CleanupRange } from "../types";
import type { BackupRestoreStrategy } from "../services/settingsRuntimeAdapterService.ts";

type CleanupOption = { value: CleanupRange; label: string };

type SettingsDataSafetyPanelProps = {
  cleanupRange: CleanupRange;
  cleanupOptions: CleanupOption[];
  restoreStrategy: BackupRestoreStrategy;
  isCleaning: boolean;
  isExportingBackup: boolean;
  isRestoringBackup: boolean;
  onCleanupRangeChange: (value: CleanupRange) => void;
  onRestoreStrategyChange: (value: BackupRestoreStrategy) => void;
  onCleanup: () => void;
  onExportBackup: () => void;
  onRestoreBackup: () => void;
};

export default function SettingsDataSafetyPanel({
  cleanupRange,
  cleanupOptions,
  restoreStrategy,
  isCleaning,
  isExportingBackup,
  isRestoringBackup,
  onCleanupRangeChange,
  onRestoreStrategyChange,
  onCleanup,
  onExportBackup,
  onRestoreBackup,
}: SettingsDataSafetyPanelProps) {
  const [strategyDialogOpen, setStrategyDialogOpen] = useState(false);
  const restoreStrategyOptions: Array<{ value: BackupRestoreStrategy; label: string }> = [
    { value: "replace", label: UI_TEXT.settings.restoreStrategyOptions.replace },
    { value: "merge", label: UI_TEXT.settings.restoreStrategyOptions.merge },
  ];

  return (
    <>
      <section className="qp-panel p-5 md:p-6">
        <div className="mb-5 flex items-center gap-2.5 border-b border-[var(--qp-border-subtle)] pb-2">
          <Database size={16} className="text-[var(--qp-accent-default)]" />
          <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.settings.dataSafetyTitle}</h2>
        </div>

        <div className="space-y-5">
          <QuietSubpanel>
            <div>
              <p className="text-sm font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.settings.backupRestoreTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--qp-text-secondary)]">
                {UI_TEXT.settings.backupRestoreHint}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <QuietActionRow>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <FileArchive size={14} className="text-[var(--qp-text-tertiary)]" />
                      <p className="text-sm font-semibold text-[var(--qp-text-primary)]">
                        {UI_TEXT.settings.backupExportTitle}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--qp-text-tertiary)]">
                      {UI_TEXT.settings.backupExportHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onExportBackup}
                    disabled={isExportingBackup || isRestoringBackup}
                    className="qp-button-secondary shrink-0 rounded-[7px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--qp-text-secondary)] disabled:opacity-50"
                  >
                    {isExportingBackup ? UI_TEXT.settings.backupExporting : UI_TEXT.settings.backupExportAction}
                  </button>
                </div>
              </QuietActionRow>

              <QuietActionRow>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <RotateCcw size={14} className="text-[var(--qp-text-tertiary)]" />
                      <p className="text-sm font-semibold text-[var(--qp-text-primary)]">
                        {UI_TEXT.settings.backupRestoreActionTitle}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--qp-text-tertiary)]">
                      {UI_TEXT.settings.backupRestoreActionHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStrategyDialogOpen(true)}
                    disabled={isExportingBackup || isRestoringBackup}
                    className="qp-button-secondary shrink-0 rounded-[7px] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--qp-text-secondary)] disabled:opacity-50"
                  >
                    {isRestoringBackup ? UI_TEXT.settings.backupRestoring : UI_TEXT.settings.backupRestoreAction}
                  </button>
                </div>
              </QuietActionRow>
            </div>
          </QuietSubpanel>

          <QuietSubpanel tone="danger" className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.settings.cleanupTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--qp-text-secondary)]">
                {UI_TEXT.settings.cleanupHint}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
              <QuietSelect
                value={cleanupRange}
                onChange={(value) => onCleanupRangeChange(value as CleanupRange)}
                className="w-[128px]"
                options={cleanupOptions}
              />

              <QuietDangerAction
                onClick={onCleanup}
                disabled={isCleaning}
                leadingIcon={isCleaning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              >
                {isCleaning ? UI_TEXT.settings.cleanupRunning : UI_TEXT.settings.cleanupNow}
              </QuietDangerAction>
            </div>
          </QuietSubpanel>
        </div>
      </section>

      <QuietDialog
        open={strategyDialogOpen}
        title={UI_TEXT.settings.restoreStrategyLabel}
        description={UI_TEXT.settings.restoreStrategyHint}
        onClose={() => setStrategyDialogOpen(false)}
        closeOnBackdrop={!isRestoringBackup}
        actions={(
          <>
            <button
              type="button"
              onClick={() => setStrategyDialogOpen(false)}
              disabled={isRestoringBackup}
              className="qp-button-secondary h-8 min-h-0 rounded-[8px] px-3 text-xs font-semibold leading-none disabled:opacity-50"
            >
              {UI_TEXT.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                setStrategyDialogOpen(false);
                onRestoreBackup();
              }}
              disabled={isExportingBackup || isRestoringBackup}
              className="qp-button-primary h-8 min-h-0 rounded-[8px] px-3 text-xs font-semibold leading-none disabled:opacity-50"
            >
              {isRestoringBackup ? UI_TEXT.settings.backupRestoring : UI_TEXT.settings.backupRestoreAction}
            </button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <QuietSegmentedFilter
            value={restoreStrategy}
            options={restoreStrategyOptions}
            onChange={onRestoreStrategyChange}
          />
        </div>
      </QuietDialog>
    </>
  );
}
