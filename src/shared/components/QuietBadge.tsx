import type { ReactNode } from "react";

type QuietBadgeTone = "neutral" | "warning" | "subtle";

interface Props {
  children: ReactNode;
  tone?: QuietBadgeTone;
  className?: string;
}

export default function QuietBadge({ children, tone = "neutral", className }: Props) {
  return (
    <span className={`qp-badge qp-badge-${tone} ${className ?? ""}`.trim()}>
      {children}
    </span>
  );
}
