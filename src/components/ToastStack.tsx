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
      container: "border-emerald-100 bg-emerald-50/95 text-emerald-700",
      icon: <CheckCircle2 size={14} />,
    };
  }

  if (tone === "warning") {
    return {
      container: "border-amber-100 bg-amber-50/95 text-amber-700",
      icon: <AlertCircle size={14} />,
    };
  }

  return {
    container: "border-indigo-100 bg-white/95 text-slate-700",
    icon: <Info size={14} />,
  };
}

export default function ToastStack({ toasts }: Props) {
  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[80] flex w-[320px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const toneStyles = resolveToneStyles(toast.tone);
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={`rounded-xl border px-3 py-2 shadow-sm backdrop-blur ${toneStyles.container}`}
            >
              <div className="flex items-start gap-2 text-xs font-medium">
                <span className="mt-[1px]">{toneStyles.icon}</span>
                <span className="leading-relaxed">{toast.message}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
