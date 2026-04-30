import type { ReactNode } from "react";
import QuietTooltip, { type QuietTooltipPlacement } from "./QuietTooltip";

type QuietIconActionTone = "neutral" | "danger";

interface Props {
  icon: ReactNode;
  title: string;
  tone?: QuietIconActionTone;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  showTooltip?: boolean;
  tooltipPlacement?: QuietTooltipPlacement;
  onClick?: () => void;
}

export default function QuietIconAction({
  icon,
  title,
  tone = "neutral",
  disabled = false,
  ariaLabel,
  className,
  showTooltip = true,
  tooltipPlacement = "top",
  onClick,
}: Props) {
  const button = (
    <button
      type="button"
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      onClick={onClick}
      className={`qp-icon-action qp-icon-action-${tone} ${className ?? ""}`.trim()}
    >
      {icon}
    </button>
  );

  if (!showTooltip) {
    return button;
  }

  return (
    <QuietTooltip label={title} placement={tooltipPlacement}>
      {button}
    </QuietTooltip>
  );
}
