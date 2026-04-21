import type { ReactNode } from "react";

type QuietIconActionTone = "neutral" | "danger";

interface Props {
  icon: ReactNode;
  title: string;
  tone?: QuietIconActionTone;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onClick?: () => void;
}

export default function QuietIconAction({
  icon,
  title,
  tone = "neutral",
  disabled = false,
  ariaLabel,
  className,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      onClick={onClick}
      className={`qp-icon-action qp-icon-action-${tone} ${className ?? ""}`.trim()}
    >
      {icon}
    </button>
  );
}
