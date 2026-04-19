import QuietDialog from "../../../shared/components/QuietDialog";
import type { UpdateSnapshot } from "../../../shared/types/update";
import {
  buildUpdateConfirmDialogModel,
  type UpdateActionModel,
} from "../services/updateViewModel";
import UpdateProgressBar from "./UpdateProgressBar";

interface UpdateConfirmDialogProps {
  open: boolean;
  snapshot: UpdateSnapshot;
  installing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onRetryCheck: () => void;
  onOpenReleasePage: () => void;
  onOpenAssetDownload: () => void;
}

function buildButtonClass(action: UpdateActionModel): string {
  const base = "qp-dialog-action disabled:cursor-not-allowed disabled:opacity-50";
  return action.emphasis === "secondary" ? `qp-button-secondary ${base}` : `qp-button-primary ${base}`;
}

export default function UpdateConfirmDialog({
  open,
  snapshot,
  installing,
  onClose,
  onConfirm,
  onRetryCheck,
  onOpenReleasePage,
  onOpenAssetDownload,
}: UpdateConfirmDialogProps) {
  const viewModel = buildUpdateConfirmDialogModel(snapshot);

  const handleAction = (action: UpdateActionModel | null) => {
    if (!action || action.disabled) return;
    switch (action.action) {
      case "open_confirm":
        onConfirm();
        return;
      case "check":
        onRetryCheck();
        return;
      case "open_release_page":
        onOpenReleasePage();
        return;
      case "open_download_url":
        onOpenAssetDownload();
    }
  };

  return (
    <QuietDialog
      open={open}
      title={viewModel.title}
      onClose={onClose}
      actions={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="qp-button-secondary qp-dialog-action"
          >
            稍后
          </button>
          {viewModel.secondaryAction ? (
            <button
              type="button"
              onClick={() => handleAction(viewModel.secondaryAction)}
              disabled={viewModel.secondaryAction.disabled}
              className={buildButtonClass(viewModel.secondaryAction)}
            >
              {viewModel.secondaryAction.label}
            </button>
          ) : null}
          {viewModel.primaryAction ? (
            <button
              type="button"
              onClick={() => handleAction(viewModel.primaryAction)}
              disabled={installing || viewModel.primaryAction.disabled}
              className={buildButtonClass(viewModel.primaryAction)}
            >
              {installing && viewModel.primaryAction.action === "open_confirm"
                ? "处理中..."
                : viewModel.primaryAction.label}
            </button>
          ) : null}
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[var(--qp-text-primary)]">{viewModel.versionCompareLabel}</p>
        <p className="text-sm leading-relaxed text-[var(--qp-text-secondary)]">{viewModel.confirmDescription}</p>
        {viewModel.progress ? (
          <UpdateProgressBar
            percent={viewModel.progress.percent}
            label={viewModel.progress.label}
            valueText={viewModel.progress.valueText}
            indeterminate={viewModel.progress.indeterminate}
          />
        ) : null}
        {viewModel.notesPreview ? (
          <div className="qp-subpanel">
            <p className="text-xs font-semibold text-[var(--qp-text-tertiary)]">更新说明</p>
            <p
              className="mt-1 break-words text-xs leading-relaxed text-[var(--qp-text-tertiary)]"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {viewModel.notesPreview}
            </p>
          </div>
        ) : null}
      </div>
    </QuietDialog>
  );
}
