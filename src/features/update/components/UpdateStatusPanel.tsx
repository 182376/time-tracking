import { RefreshCw } from "lucide-react";
import type { UpdateSnapshot } from "../../../shared/types/update";
import { buildUpdateStatusPanelModel } from "../services/updateViewModel";

interface UpdateStatusPanelProps {
  snapshot: UpdateSnapshot;
  checking: boolean;
  installing: boolean;
  onCheckUpdates: () => void;
  onOpenConfirmDialog: () => void;
  onOpenReleaseNotes: () => void;
  onOpenFeedback: () => void;
}

export default function UpdateStatusPanel({
  snapshot,
  checking,
  installing,
  onCheckUpdates,
  onOpenConfirmDialog,
  onOpenReleaseNotes,
  onOpenFeedback,
}: UpdateStatusPanelProps) {
  const viewModel = buildUpdateStatusPanelModel(snapshot, checking, installing);

  const handlePrimaryAction = () => {
    if (viewModel.primaryAction.action === "open_confirm") {
      onOpenConfirmDialog();
      return;
    }
    onCheckUpdates();
  };

  return (
    <div className="qp-subpanel">
      <p className="text-sm font-semibold text-[var(--qp-text-primary)]">应用更新</p>
      <p className="mt-2 text-sm font-semibold text-[var(--qp-text-primary)]">{viewModel.statusTitle}</p>
      {viewModel.statusDetail ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--qp-text-secondary)] break-words">
          {viewModel.statusDetail}
        </p>
      ) : null}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs text-[var(--qp-text-tertiary)]">
          <button
            type="button"
            onClick={onOpenReleaseNotes}
            className="text-xs text-[var(--qp-text-tertiary)] hover:text-[var(--qp-text-secondary)]"
          >
            更新说明
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={onOpenFeedback}
            className="text-xs text-[var(--qp-text-tertiary)] hover:text-[var(--qp-text-secondary)]"
          >
            问题反馈
          </button>
        </div>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={viewModel.primaryAction.disabled}
          className="qp-button-primary inline-flex min-h-[34px] items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {viewModel.primaryAction.loading ? <RefreshCw size={12} className="animate-spin" /> : null}
          {viewModel.primaryAction.label}
        </button>
      </div>
    </div>
  );
}
