import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export type QuietToastTone = "success" | "warning" | "info";

interface Props {
  message: string;
  tone: QuietToastTone;
}

function resolveToastTone(tone: QuietToastTone): { icon: ReactNode; className: string } {
  if (tone === "success") {
    return {
      icon: <CheckCircle2 size={14} className="text-[var(--qp-success)]" />,
      className: "qp-toast-success",
    };
  }

  if (tone === "warning") {
    return {
      icon: <AlertCircle size={14} className="text-[var(--qp-warning)]" />,
      className: "qp-toast-warning",
    };
  }

  return {
    icon: <Info size={14} className="text-[var(--qp-accent-default)]" />,
    className: "qp-toast-info",
  };
}

export default function QuietToast({ message, tone }: Props) {
  const toneMeta = resolveToastTone(tone);
  return (
    <div className={`qp-toast ${toneMeta.className}`}>
      <div className="qp-toast-content">
        <span className="qp-toast-icon">{toneMeta.icon}</span>
        <span className="qp-toast-message">{message}</span>
      </div>
    </div>
  );
}
