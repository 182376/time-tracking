import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import QuietToast, { type QuietToastTone } from "./QuietToast";

export type ToastTone = QuietToastTone;

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface Props {
  toasts: ToastItem[];
}

export default function ToastStack({ toasts }: Props) {
  const content = (
    <div className="pointer-events-none fixed right-4 top-4 md:right-6 md:top-6 z-[80] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              <QuietToast message={toast.message} tone={toast.tone} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}
