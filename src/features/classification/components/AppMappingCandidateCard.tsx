import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { ObservedAppCandidate } from "../types";
import type { UserAssignableAppCategory } from "../config/categoryTokens";
import type { ColorDisplayFormat } from "../../../shared/lib/colorFormatting";
import QuietSelect from "../../../shared/components/QuietSelect";
import QuietColorField from "../../../shared/components/QuietColorField";
import QuietInlineAction from "../../../shared/components/QuietInlineAction";
import QuietIconAction from "../../../shared/components/QuietIconAction";
import QuietBadge from "../../../shared/components/QuietBadge";
import QuietResetAction from "../../../shared/components/QuietResetAction";

interface AppMappingCandidateCardProps {
  candidate: ObservedAppCandidate;
  icon?: string;
  displayName: string;
  displayColor: string;
  assignedCategory: UserAssignableAppCategory;
  trackingEnabled: boolean;
  titleCaptureEnabled: boolean;
  isBusy: boolean;
  isEditingName: boolean;
  inputValue: string;
  hasManualColor: boolean;
  colorFormat: ColorDisplayFormat;
  categoryOptions: Array<{ value: string; label: string }>;
  onNameDraftChange: (nextValue: string) => void;
  onNameBlur: () => void;
  onNameEditCancel: () => void;
  onStartNameEdit: () => void;
  onColorAssign: (nextColor?: string | null) => void;
  onColorFormatChange: (nextFormat: ColorDisplayFormat) => void;
  onCategoryAssign: (value: string) => void;
  onToggleTitleCapture: () => void;
  onToggleTracking: () => void;
  onResetOverride: () => void;
  onDeleteAllSessions: () => void;
}

export default function AppMappingCandidateCard({
  candidate,
  icon,
  displayName,
  displayColor,
  assignedCategory,
  trackingEnabled,
  titleCaptureEnabled,
  isBusy,
  isEditingName,
  inputValue,
  hasManualColor,
  colorFormat,
  categoryOptions,
  onNameDraftChange,
  onNameBlur,
  onNameEditCancel,
  onStartNameEdit,
  onColorAssign,
  onColorFormatChange,
  onCategoryAssign,
  onToggleTitleCapture,
  onToggleTracking,
  onResetOverride,
  onDeleteAllSessions,
}: AppMappingCandidateCardProps) {
  return (
    <div
      className="relative rounded-[12px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] px-4 py-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="mt-0.5 h-10 w-10 rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] p-1.5"
            style={{ boxShadow: `0 0 0 2px ${displayColor}22` }}
          >
            {icon ? (
              <img src={icon} className="h-full w-full object-contain" alt="" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--qp-text-tertiary)]">
                {(displayName || candidate.exeName).slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex max-w-full items-center gap-1">
              {isEditingName ? (
                <input
                  id={`app-name-${candidate.exeName}`}
                  value={inputValue}
                  autoFocus
                  disabled={isBusy}
                  onChange={(event) => {
                    onNameDraftChange(event.target.value);
                  }}
                  onBlur={onNameBlur}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                      return;
                    }
                    if (event.key === "Escape") {
                      onNameEditCancel();
                    }
                  }}
                  className="max-w-[240px] truncate rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-2 py-1 text-[15px] font-semibold text-[var(--qp-text-primary)] outline-none disabled:cursor-not-allowed"
                />
              ) : (
                <span className="truncate rounded-[8px] px-2 py-1 text-[15px] font-semibold text-[var(--qp-text-primary)]">
                  {displayName}
                </span>
              )}
              <QuietIconAction
                icon={<Pencil size={13} />}
                title="修改应用名称"
                disabled={isBusy}
                onClick={onStartNameEdit}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
              <QuietBadge>
                {candidate.exeName}
              </QuietBadge>
              {!trackingEnabled && (
                <QuietBadge tone="warning">
                  不统计
                </QuietBadge>
              )}
              {!titleCaptureEnabled && (
                <QuietBadge tone="subtle">
                  不记标题
                </QuietBadge>
              )}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 items-end">
          <div className="flex flex-nowrap items-center gap-2">
            <div className="order-2 flex max-w-full flex-wrap items-center gap-2 rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-2 py-1.5">
              <QuietColorField
                color={displayColor}
                format={colorFormat}
                fixedValueSlot
                disabled={isBusy}
                onChange={(nextColor) => onColorAssign(nextColor)}
                onFormatChange={onColorFormatChange}
                title="颜色"
              />

              <QuietResetAction
                disabled={isBusy}
                dimmed={!hasManualColor}
                onClick={() => onColorAssign(null)}
                title="恢复默认颜色"
              >
                默认
              </QuietResetAction>
            </div>
            <QuietSelect
              value={assignedCategory}
              disabled={isBusy}
              className="order-1 min-w-[132px]"
              onChange={(value) => onCategoryAssign(String(value))}
              options={categoryOptions}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <QuietInlineAction
              disabled={isBusy}
              onClick={onToggleTitleCapture}
              tone={titleCaptureEnabled ? "neutral" : "accent"}
              title={titleCaptureEnabled ? "不记录该应用窗口标题" : "恢复记录该应用窗口标题"}
            >
              {titleCaptureEnabled ? "记录标题" : "不记标题"}
            </QuietInlineAction>
            <QuietInlineAction
              disabled={isBusy}
              onClick={onToggleTracking}
              tone={trackingEnabled ? "warning" : "accent"}
              title={trackingEnabled ? "将该应用排除出统计" : "恢复该应用进入统计"}
            >
              {trackingEnabled ? "统计中" : "不统计"}
            </QuietInlineAction>
            <QuietInlineAction
              disabled={isBusy}
              onClick={onResetOverride}
              tone="neutral"
              title="恢复该应用默认识别"
              leadingIcon={<RotateCcw size={12} />}
            >
              恢复默认
            </QuietInlineAction>
            <QuietInlineAction
              disabled={isBusy}
              onClick={onDeleteAllSessions}
              tone="danger"
              title="删除应用记录"
              leadingIcon={<Trash2 size={12} />}
            >
              删除应用记录
            </QuietInlineAction>
          </div>
        </div>
      </div>
    </div>
  );
}
