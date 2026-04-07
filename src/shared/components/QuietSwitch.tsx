interface Props {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (nextChecked: boolean) => void;
  tone?: "success" | "warning";
}

export default function QuietSwitch({
  checked,
  disabled = false,
  ariaLabel,
  onChange,
  tone = "success",
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`qp-switch ${checked ? "qp-switch-checked" : "qp-switch-unchecked"} ${tone === "warning" ? "qp-switch-warning" : "qp-switch-success"}`}
    >
      <span className={`qp-switch-thumb ${checked ? "qp-switch-thumb-checked" : "qp-switch-thumb-unchecked"}`} />
    </button>
  );
}
