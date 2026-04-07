import type { ReactNode } from "react";

type QuietIconActionTone = "neutral" | "danger";

interface Props {
  icon: ReactNode;
  title: string;
  tone?: QuietIconActionTone;
  disabled?: boolean;
  onClick?: () => void;
}

export default function QuietIconAction({
  icon,
  title,
  tone = "neutral",
  disabled = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`qp-icon-action qp-icon-action-${tone}`}
    >
      {icon}
    </button>
  );
}
