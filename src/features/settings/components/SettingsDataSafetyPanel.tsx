import { Database, RefreshCw, Trash2 } from "lucide-react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import QuietDangerAction from "../../../shared/components/QuietDangerAction";
import QuietSubpanel from "../../../shared/components/QuietSubpanel";
import QuietActionRow from "../../../shared/components/QuietActionRow";
import QuietSelect from "../../../shared/components/QuietSelect";
import type { CleanupRange } from "../types";

type CleanupOption = { value: CleanupRange; label: string };

type SettingsDataSafetyPanelProps = {
  cleanupRange: CleanupRange;
  cleanupOptions: CleanupOption[];
  isCleaning: boolean;
  isExportingBackup: boolean;
  isRestoringBackup: boolean;
  onCleanupRangeChange: (value: CleanupRange) => void;
  onCleanup: () => void;
  onExportBackup: () => void;
  onRestoreBackup: () => void;
};

export default function SettingsDataSafetyPanel({
  cleanupRange,
  cleanupOptions,
  isCleaning,
  isExportingBackup,
  isRestoringBackup,
  onCleanupRangeChange,
  onCleanup,
  onExportBackup,
  onRestoreBackup,
}: SettingsDataSafetyPanelProps) {
  return (
    <section className="qp-panel p-5 md:p-6">
      <div className="mb-5 flex items-center gap-2.5 border-b border-[var(--qp-border-subtle)] pb-2">
        <Database size={16} className="text-[var(--qp-danger)]" />
        <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">数据安全</h2>
      </div>

      <div className="space-y-5">
        <QuietSubpanel>
          <p className="text-sm font-semibold text-[var(--qp-text-primary)]">备份与恢复</p>
          <p className="mt-1 text-sm text-[var(--qp-text-secondary)]">
            包含会话数据、设置项和图标缓存。恢复会覆盖当前数据。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <QuietActionRow className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--qp-text-primary)]">导出</p>
                <p className="mt-0.5 text-xs text-[var(--qp-text-tertiary)]">生成当前数据快照</p>
              </div>
              <button
                type="button"
                onClick={onExportBackup}
                disabled={isExportingBackup || isRestoringBackup}
                className="qp-button-secondary rounded-[8px] px-3 py-2 text-xs font-semibold text-[var(--qp-text-secondary)] disabled:opacity-50"
              >
                {isExportingBackup ? "导出中..." : "导出"}
              </button>
            </QuietActionRow>

            <QuietActionRow className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--qp-text-primary)]">恢复</p>
                <p className="mt-0.5 text-xs text-[var(--qp-text-tertiary)]">从备份文件回滚数据</p>
              </div>
              <button
                type="button"
                onClick={onRestoreBackup}
                disabled={isExportingBackup || isRestoringBackup}
                className="qp-button-secondary rounded-[8px] px-3 py-2 text-xs font-semibold text-[var(--qp-text-secondary)] disabled:opacity-50"
              >
                {isRestoringBackup ? "恢复中..." : "恢复"}
              </button>
            </QuietActionRow>
          </div>
        </QuietSubpanel>

        <QuietSubpanel tone="danger">
          <p className="text-sm font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.settings.cleanupTitle}</p>
          <p className="mt-1 text-sm text-[var(--qp-text-secondary)]">{UI_TEXT.settings.cleanupHint}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
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
  );
}
