import { useCallback, useEffect, useRef, useState } from "react";
import type { QuietToastTone } from "../../shared/components/QuietToast";
import type { QuietToastItem } from "../../shared/components/QuietToastStack";

const TOAST_AUTO_DISMISS_MS = 3200;
const TOAST_ID_SALT_MAX = 1000;

export function useAppShellToasts() {
  const [toasts, setToasts] = useState<QuietToastItem[]>([]);
  const toastTimerIdsRef = useRef<number[]>([]);

  const pushToast = useCallback((message: string, tone: QuietToastTone = "info") => {
    const id = Date.now() + Math.floor(Math.random() * TOAST_ID_SALT_MAX);
    setToasts((current) => [...current, { id, message, tone }]);

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimerIdsRef.current = toastTimerIdsRef.current.filter((existingId) => existingId !== timerId);
    }, TOAST_AUTO_DISMISS_MS);

    toastTimerIdsRef.current.push(timerId);
  }, []);

  useEffect(() => {
    return () => {
      toastTimerIdsRef.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      toastTimerIdsRef.current = [];
    };
  }, []);

  return {
    toasts,
    pushToast,
  };
}
