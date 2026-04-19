import { RefreshCw } from "lucide-react";
import type { UpdateSnapshot } from "../../../shared/types/update";
import {
  buildUpdateStatusPanelModel,
  type UpdateActionModel,
} from "../services/updateViewModel";
import UpdateProgressBar from "./UpdateProgressBar";

interface UpdateStatusPanelProps {
  snapshot: UpdateSnapshot;
  checking: boolean;
  installing: boolean;
  onCheckUpdates: () => void;
  onOpenConfirmDialog: () => void;
  onOpenUpdateReleasePage: () => void;
  onOpenUpdateDownload: () => void;
  onOpenReleaseNotes: () => void;
  onOpenFeedback: () => void;
}

function renderActionLabel(action: UpdateActionModel) {
  return (
    <>
      {action.loading ? <RefreshCw size={12} className="animate-spin" /> : null}
      {action.label}
    </>
  );
}

export default function UpdateStatusPanel({
  snapshot,
  checking,
  installing,
  onCheckUpdates,
  onOpenConfirmDialog,
  onOpenUpdateReleasePage,
  onOpenUpdateDownload,
  onOpenReleaseNotes,
  onOpenFeedback,
}: UpdateStatusPanelProps) {
  const viewModel = buildUpdateStatusPanelModel(snapshot, checking, installing);

  const handleAction = (action: UpdateActionModel) => {
    if (action.disabled) return;
    switch (action.action) {
      case "open_confirm":
        onOpenConfirmDialog();
        return;
      case "open_release_page":
        onOpenUpdateReleasePage();
        return;
      case "open_download_url":
        onOpenUpdateDownload();
        return;
      case "check":
      default:
        onCheckUpdates();
    }
  };

  return (
    <div className="qp-subpanel">
      <p className="text-sm font-semibold text-[var(--qp-text-primary)]">应用更新</p>
      <p className="mt-2 text-sm font-semibold text-[var(--qp-text-primary)]">{viewModel.statusTitle}</p>
      {viewModel.statusDetail ? (
        <p className="mt-1 text-xs leading-relaxed break-words text-[var(--qp-text-secondary)]">
          {viewModel.statusDetail}
        </p>
      ) : null}
      {viewModel.progress ? (
        <UpdateProgressBar
          className="mt-3"
          percent={viewModel.progress.percent}
          label={viewModel.progress.label}
          valueText={viewModel.progress.valueText}
          indeterminate={viewModel.progress.indeterminate}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {viewModel.secondaryAction ? (
            <button
              type="button"
              onClick={() => handleAction(viewModel.secondaryAction!)}
              disabled={viewModel.secondaryAction.disabled}
              className="qp-button-secondary inline-flex min-h-[34px] items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {renderActionLabel(viewModel.secondaryAction)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleAction(viewModel.primaryAction)}
            disabled={viewModel.primaryAction.disabled}
            className="qp-button-primary inline-flex min-h-[34px] items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {renderActionLabel(viewModel.primaryAction)}
          </button>
        </div>
      </div>
    </div>
  );
}
