import QuietDialog from "../../../shared/components/QuietDialog";
import type { UpdateSnapshot } from "../../../shared/types/update";
import {
  buildUpdateConfirmDialogModel,
  shouldOpenUpdateDialogForSnapshot,
} from "../services/updateViewModel";

interface UpdateConfirmDialogProps {
  open: boolean;
  snapshot: UpdateSnapshot;
  installing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function UpdateConfirmDialog({
  open,
  snapshot,
  installing,
  onClose,
  onConfirm,
}: UpdateConfirmDialogProps) {
  const canConfirm = shouldOpenUpdateDialogForSnapshot(snapshot);
  const viewModel = buildUpdateConfirmDialogModel(snapshot);

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
          <button
            type="button"
            onClick={onConfirm}
            disabled={installing || !canConfirm}
            className="qp-button-primary qp-dialog-action disabled:cursor-not-allowed disabled:opacity-50"
          >
            {installing ? "处理中..." : viewModel.confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-[var(--qp-text-primary)]">{viewModel.versionCompareLabel}</p>
        <p className="text-sm leading-relaxed text-[var(--qp-text-secondary)]">{viewModel.confirmDescription}</p>
        {viewModel.notesPreview ? (
          <div className="qp-subpanel">
            <p className="text-xs font-semibold text-[var(--qp-text-tertiary)]">更新说明</p>
            <p
              className="mt-1 text-xs leading-relaxed text-[var(--qp-text-tertiary)] break-words"
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
