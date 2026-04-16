import { useCallback } from "react";
import type { UpdateSnapshot } from "../../shared/types/update";
import { useUpdateDialog } from "./useUpdateDialog";

interface SidebarUpdateEntry {
  showUpdateEntry: boolean;
  onOpenUpdateDialog: () => void;
}

interface SettingsUpdateEntry {
  updateSnapshot: UpdateSnapshot;
  updateChecking: boolean;
  updateInstalling: boolean;
  onCheckForUpdates: () => Promise<void>;
  onOpenUpdateDialog: () => void;
}

export function useAppShellUpdateEntry() {
  const {
    snapshot,
    isChecking,
    isInstalling,
    shouldShowSidebarEntry,
    openUpdateDialog,
    checkForUpdates,
  } = useUpdateDialog();

  const handleCheckForUpdates = useCallback(async () => {
    await checkForUpdates(false);
  }, [checkForUpdates]);

  const sidebarUpdateEntry: SidebarUpdateEntry = {
    showUpdateEntry: shouldShowSidebarEntry,
    onOpenUpdateDialog: openUpdateDialog,
  };

  const settingsUpdateEntry: SettingsUpdateEntry = {
    updateSnapshot: snapshot,
    updateChecking: isChecking,
    updateInstalling: isInstalling,
    onCheckForUpdates: handleCheckForUpdates,
    onOpenUpdateDialog: openUpdateDialog,
  };

  return {
    sidebarUpdateEntry,
    settingsUpdateEntry,
  };
}
