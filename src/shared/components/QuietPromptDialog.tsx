import QuietDialog from "./QuietDialog";

interface QuietPromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmDisabled?: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function QuietPromptDialog({
  open,
  title,
  description,
  value,
  placeholder,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  onChange,
  onCancel,
  onConfirm,
}: QuietPromptDialogProps) {
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
            disabled={confirmDisabled}
            className="qp-button-primary qp-dialog-action disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <input
        type="text"
        value={value}
        autoFocus
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !confirmDisabled) {
            event.preventDefault();
            onConfirm();
          }
        }}
        className="qp-control qp-dialog-input"
      />
    </QuietDialog>
  );
}
