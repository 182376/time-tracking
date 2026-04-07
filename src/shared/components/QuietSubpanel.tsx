import type { ReactNode } from "react";

type QuietSubpanelTone = "default" | "danger";

interface Props {
  children: ReactNode;
  tone?: QuietSubpanelTone;
  className?: string;
}

export default function QuietSubpanel({
  children,
  tone = "default",
  className,
}: Props) {
  const toneClass = tone === "danger" ? "qp-subpanel-danger" : "";
  return (
    <section className={`qp-subpanel ${toneClass} ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}
