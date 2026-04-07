import type { AppSettings } from "../../lib/settings-store";
import type { ToastTone } from "../../shared/components/ToastStack";

export interface SettingsPageProps {
  onSettingsChanged: (settings: AppSettings) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
}

export type CleanupRange = 180 | 90 | 60 | 30 | 15 | 7;
