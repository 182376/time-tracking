import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export type ToastTone = "success" | "warning" | "info";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface Props {
  toasts: ToastItem[];
}

function resolveToneStyles(tone: ToastTone) {
  if (tone === "success") {
    return {
      container: "border-[color:var(--qp-success)]/30 bg-[var(--qp-bg-panel)] text-[var(--qp-text-secondary)]",
      icon: <CheckCircle2 size={14} className="text-[var(--qp-success)]" />,
    };
  }

  if (tone === "warning") {
    return {
      container: "border-[color:var(--qp-warning)]/30 bg-[var(--qp-bg-panel)] text-[var(--qp-text-secondary)]",
      icon: <AlertCircle size={14} className="text-[var(--qp-warning)]" />,
    };
  }

  return {
    container: "border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] text-[var(--qp-text-secondary)]",
    icon: <Info size={14} className="text-[var(--qp-accent-default)]" />,
  };
}

export default function ToastStack({ toasts }: Props) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 md:right-6 md:top-6 z-[80] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const toneStyles = resolveToneStyles(toast.tone);
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className={`rounded-[10px] border px-3 py-2 shadow-[var(--qp-shadow-toast)] ${toneStyles.container}`}
            >
              <div className="flex items-start gap-2 text-xs font-medium">
                <span className="mt-[1px] shrink-0">{toneStyles.icon}</span>
                <span className="leading-relaxed">{toast.message}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
