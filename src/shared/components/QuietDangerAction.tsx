import type { ReactNode } from "react";
import QuietTooltip from "./QuietTooltip";

interface Props {
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  leadingIcon?: ReactNode;
  onClick?: () => void;
}

export default function QuietDangerAction({
  children,
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
      className="qp-danger-action"
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
