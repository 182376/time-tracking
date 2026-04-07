import type { ReactNode } from "react";

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
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`qp-inline-action qp-inline-action-${tone}`}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
