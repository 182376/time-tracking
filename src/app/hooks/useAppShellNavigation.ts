import { useCallback, useRef, useState } from "react";
import { UI_TEXT } from "../../shared/copy/uiText.ts";
import type { View } from "../../shared/types/app";

type SaveHandler = (() => Promise<boolean>) | null;

interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
}

interface UseAppShellNavigationParams {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

interface ViewDirtyState {
  settings: boolean;
  mapping: boolean;
}

const INITIAL_DIRTY_STATE: ViewDirtyState = {
  settings: false,
  mapping: false,
};

export function useAppShellNavigation({ confirm }: UseAppShellNavigationParams) {
  const settingsSaveHandlerRef = useRef<SaveHandler>(null);
  const mappingSaveHandlerRef = useRef<SaveHandler>(null);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [viewDirtyState, setViewDirtyState] = useState<ViewDirtyState>(INITIAL_DIRTY_STATE);

  const registerSettingsSaveHandler = useCallback((handler: SaveHandler) => {
    settingsSaveHandlerRef.current = handler;
  }, []);

  const registerMappingSaveHandler = useCallback((handler: SaveHandler) => {
    mappingSaveHandlerRef.current = handler;
  }, []);

  const setSettingsDirty = useCallback((dirty: boolean) => {
    setViewDirtyState((current) => ({ ...current, settings: dirty }));
  }, []);

  const setMappingDirty = useCallback((dirty: boolean) => {
    setViewDirtyState((current) => ({ ...current, mapping: dirty }));
  }, []);

  const handleNavigate = useCallback((nextView: View) => {
    void (async () => {
      if (nextView === currentView) {
        return;
      }

      const hasUnsavedChanges = viewDirtyState.settings || viewDirtyState.mapping;
      if (!hasUnsavedChanges) {
        setCurrentView(nextView);
        return;
      }

      const confirmed = await confirm({
        title: UI_TEXT.app.unsavedConfirmTitle,
        description: UI_TEXT.app.unsavedConfirmBody,
        confirmLabel: UI_TEXT.app.unsavedConfirmSave,
      });
      if (!confirmed) {
        return;
      }

      const saveHandler = currentView === "settings"
        ? settingsSaveHandlerRef.current
        : currentView === "mapping"
          ? mappingSaveHandlerRef.current
          : null;
      const didSave = saveHandler ? await saveHandler() : false;
      if (!didSave) {
        return;
      }

      setViewDirtyState((current) => {
        if (currentView === "settings") {
          return { ...current, settings: false };
        }
        if (currentView === "mapping") {
          return { ...current, mapping: false };
        }
        return current;
      });
      setCurrentView(nextView);
    })();
  }, [confirm, currentView, viewDirtyState]);

  return {
    currentView,
    handleNavigate,
    registerSettingsSaveHandler,
    registerMappingSaveHandler,
    setSettingsDirty,
    setMappingDirty,
  };
}
