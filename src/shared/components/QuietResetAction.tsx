import type { ReactNode } from "react";

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
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`qp-reset-action ${dimmed ? "qp-reset-action-dimmed" : ""}`.trim()}
    >
      {children}
    </button>
  );
}
