import type { ReactNode } from "react";
import QuietTooltip from "./QuietTooltip";

type QuietInlineActionTone = "neutral" | "accent" | "warning" | "danger";

interface Props {
  children: ReactNode;
  tone?: QuietInlineActionTone;
  disabled?: boolean;
  title?: string;
  leadingIcon?: ReactNode;
  onClick?: () => void;
}

export default function QuietInlineAction({
  children,
  tone = "neutral",
  disabled = false,
  title,
  leadingIcon,
  onClick,
}: Props) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`qp-inline-action qp-inline-action-${tone}`}
    >
      {leadingIcon}
      {children}
    </button>
  );

  if (!title) {
    return button;
  }

  return (
    <QuietTooltip label={title}>
      {button}
    </QuietTooltip>
  );
}
