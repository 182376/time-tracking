import type { ReactNode } from "react";
import QuietTooltip from "./QuietTooltip";

interface Props {
  children?: ReactNode;
  disabled?: boolean;
  dimmed?: boolean;
  title?: string;
  onClick?: () => void;
}

export default function QuietResetAction({
  children = "默认",
  disabled = false,
  dimmed = false,
  title,
  onClick,
}: Props) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`qp-reset-action ${dimmed ? "qp-reset-action-dimmed" : ""}`.trim()}
    >
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
