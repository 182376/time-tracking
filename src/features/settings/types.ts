import type { AppSettings } from "../../lib/settings-store";
import type { ToastTone } from "../../shared/components/ToastStack";
import type { UpdateSnapshot } from "../../shared/types/update";

export interface SettingsPageProps {
  onSettingsChanged: (settings: AppSettings) => void;
  onCheckForUpdates?: () => Promise<void>;
  onOpenUpdateDialog?: () => void;
  updateSnapshot?: UpdateSnapshot;
  updateChecking?: boolean;
  updateInstalling?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
}

export type CleanupRange = 180 | 90 | 60 | 30 | 15 | 7;
