import { useEffect, useMemo, useState } from "react";
import {
  applyWidgetLayout,
  getWidgetPlacement,
  onCurrentWidgetWindowFocusChanged,
  onCurrentWidgetWindowMoved,
  readCurrentWidgetWindowRect,
  resolveWidgetMonitorForWindowRect,
  setCurrentWidgetWindowFocusable,
  setWidgetExpanded,
  type WidgetPlacement,
} from "../../platform/desktop/widgetRuntimeGateway";
import {
  clampWidgetAnchorY,
  createWidgetWindowController,
  DEFAULT_WIDGET_PLACEMENT,
} from "./widgetWindowController.ts";

export const WIDGET_EXPANDED_WIDTH_WITH_OBJECT = 148;
export const WIDGET_EXPANDED_WIDTH_COMPACT = 116;
export const WIDGET_EXPANDED_HEIGHT = 48;
export const WIDGET_COLLAPSED_WIDTH = 34;
export const WIDGET_COLLAPSED_HEIGHT = 48;

export function useWidgetWindowState(showObjectSlot: boolean) {
  const [placement, setPlacementState] = useState<WidgetPlacement>(DEFAULT_WIDGET_PLACEMENT);
  const [expanded, setExpandedState] = useState(false);
  const controller = useMemo(() => createWidgetWindowController(showObjectSlot, {
    loadPlacement: getWidgetPlacement,
    persistExpanded: setWidgetExpanded,
    applyLayout: async (nextPlacement, nextExpanded, nextShowObjectSlot) => {
      await applyWidgetLayout(
        nextPlacement.side,
        nextPlacement.anchorY,
        nextExpanded,
        nextShowObjectSlot,
      );
    },
    readWindowRect: readCurrentWidgetWindowRect,
    resolveMonitorForWindowRect: resolveWidgetMonitorForWindowRect,
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearScheduled: (handle) => window.clearTimeout(handle),
    onPlacementChange: (nextPlacement) => {
      setPlacementState({
        side: nextPlacement.side,
        anchorY: clampWidgetAnchorY(nextPlacement.anchorY),
      });
    },
    onExpandedChange: setExpandedState,
    onWarning: (message, error) => {
      console.warn(message, error);
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    const unlistenPromises: Array<Promise<() => void>> = [];

    void setCurrentWidgetWindowFocusable(true).catch((error) => {
      console.warn("widget set focusable failed", error);
    });

    void controller.initialize().then(() => {
      if (cancelled) {
        controller.dispose();
      }
    });

    unlistenPromises.push(onCurrentWidgetWindowMoved(() => {
      controller.handleWindowMoved();
    }));

    unlistenPromises.push(onCurrentWidgetWindowFocusChanged((focused) => {
      controller.handleFocusChanged(focused);
    }));

    return () => {
      cancelled = true;
      controller.dispose();
      for (const promise of unlistenPromises) {
        void promise.then((unlisten) => {
          unlisten();
        });
      }
    };
  }, [controller]);

  useEffect(() => {
    controller.setShowObjectSlot(showObjectSlot);
  }, [controller, showObjectSlot]);

  return {
    collapse: controller.collapse,
    expand: controller.expand,
    expanded,
    placement,
    toggleExpanded: controller.toggleExpanded,
  };
}
