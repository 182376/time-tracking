import { useCallback, useEffect, useState } from "react";
import type { UpdateSnapshot } from "../../shared/types/update";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateSnapshot,
  installUpdate,
} from "../../platform/runtime/updateRuntimeGateway";
import { shouldShowSidebarUpdateEntry } from "../../features/update/services/updateViewModel";

function createFallbackSnapshot(): UpdateSnapshot {
  return {
    current_version: "0.0.0",
    status: "idle",
    latest_version: null,
    release_notes: null,
    release_date: null,
    error_message: null,
  };
}

export function useUpdateState() {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot>(createFallbackSnapshot);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getUpdateSnapshot()
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Failed to load update snapshot", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runUpdateCheck = useCallback(async (silent: boolean) => {
    if (isChecking) return snapshot;
    setIsChecking(true);
    try {
      const nextSnapshot = await checkForUpdates(silent);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      if (!silent) {
        const message = error instanceof Error ? error.message : String(error);
        const errorSnapshot = {
          ...snapshot,
          status: "error" as const,
          error_message: message,
        };
        setSnapshot((current) => ({
          ...current,
          status: "error",
          error_message: message,
        }));
        return errorSnapshot;
      }
      return snapshot;
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, snapshot]);

  const runConfirmAction = useCallback(async () => {
    if (isInstalling) return snapshot;
    if (snapshot.status !== "available" && snapshot.status !== "downloaded") return snapshot;
    setIsInstalling(true);
    try {
      const nextSnapshot = snapshot.status === "downloaded"
        ? await installUpdate()
        : await downloadUpdate();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorSnapshot = {
        ...snapshot,
        status: "error" as const,
        error_message: message,
      };
      setSnapshot((current) => ({
        ...current,
        status: "error",
        error_message: message,
      }));
      return errorSnapshot;
    } finally {
      setIsInstalling(false);
    }
  }, [isInstalling, snapshot]);

  return {
    snapshot,
    isChecking,
    isInstalling,
    dialogOpen,
    shouldShowSidebarEntry: shouldShowSidebarUpdateEntry(snapshot),
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
    checkForUpdates: runUpdateCheck,
    confirmUpdateAction: runConfirmAction,
  };
}
