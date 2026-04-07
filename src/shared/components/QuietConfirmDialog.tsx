import QuietDialog from "./QuietDialog";

interface QuietConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function QuietConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = false,
  confirmDisabled = false,
  confirmLoading = false,
  onCancel,
  onConfirm,
}: QuietConfirmDialogProps) {
  return (
    <QuietDialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      actions={(
        <>
          <button
            type="button"
            onClick={onCancel}
            className="qp-button-secondary qp-dialog-action"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || confirmLoading}
            className={`qp-dialog-action ${danger ? "qp-button-danger" : "qp-button-primary"} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {confirmLoading ? "处理中..." : confirmLabel}
          </button>
        </>
      )}
    />
  );
}
