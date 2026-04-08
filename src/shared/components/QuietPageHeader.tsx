import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
}

export default function QuietPageHeader({
  icon,
  title,
  subtitle,
  rightSlot,
}: Props) {
  return (
    <header className="qp-panel qp-page-header">
      <div className="qp-page-header-left">
        <div className="qp-page-header-icon">
          {icon}
        </div>
        <div className="qp-page-header-copy">
          <h1 className="qp-page-header-title">{title}</h1>
          {subtitle ? (
            <div className="qp-page-header-subtitle">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      {rightSlot ? (
        <div className="qp-page-header-right">
          {rightSlot}
        </div>
      ) : null}
    </header>
  );
}
