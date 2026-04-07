import type { ReactNode } from "react";

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
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="qp-danger-action"
    >
      {leadingIcon}
      {children}
    </button>
  );
}
