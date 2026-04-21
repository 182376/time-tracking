import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PhysicalPosition,
  PhysicalSize,
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import {
  applyWidgetLayout,
  getWidgetPlacement,
  setWidgetExpanded,
  type WidgetPlacement,
  type WidgetSide,
} from "../../platform/desktop/widgetRuntimeGateway";

export const WIDGET_EXPANDED_WIDTH_WITH_OBJECT = 148;
export const WIDGET_EXPANDED_WIDTH_COMPACT = 116;
export const WIDGET_EXPANDED_HEIGHT = 48;
export const WIDGET_COLLAPSED_WIDTH = 34;
export const WIDGET_COLLAPSED_HEIGHT = 48;

const DEFAULT_WIDGET_PLACEMENT: WidgetPlacement = {
  side: "right",
  anchor_y: 0.28,
};

const DRAG_SETTLE_MS = 160;

function clampAnchorY(anchorY: number) {
  if (!Number.isFinite(anchorY)) {
    return DEFAULT_WIDGET_PLACEMENT.anchor_y;
  }

  return Math.max(0, Math.min(1, anchorY));
}

async function resolveMonitorForWindowRect(
  position: PhysicalPosition | null,
  size: PhysicalSize | null,
): Promise<Monitor | null> {
  const monitors = await availableMonitors().catch(() => []);
  if (position && size && monitors.length > 0) {
    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;

    for (const monitor of monitors) {
      const workArea = monitor.workArea;
      if (
        centerX >= workArea.position.x
        && centerX <= (workArea.position.x + workArea.size.width)
        && centerY >= workArea.position.y
        && centerY <= (workArea.position.y + workArea.size.height)
      ) {
        return monitor;
      }
    }

    let nearestMonitor = monitors[0] ?? null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const monitor of monitors) {
      const workArea = monitor.workArea;
      const workCenterX = workArea.position.x + workArea.size.width / 2;
      const workCenterY = workArea.position.y + workArea.size.height / 2;
      const distance = ((workCenterX - centerX) ** 2) + ((workCenterY - centerY) ** 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestMonitor = monitor;
      }
    }

    if (nearestMonitor) {
      return nearestMonitor;
    }
  }

  const current = await currentMonitor().catch(() => null);
  if (current) {
    return current;
  }

  return primaryMonitor().catch(() => null);
}

function resolvePlacementFromWindowRect(
  monitor: Monitor,
  position: PhysicalPosition,
  size: PhysicalSize,
): WidgetPlacement {
  const workArea = monitor.workArea;
  const centerX = position.x + size.width / 2;
  const side: WidgetSide = centerX < (workArea.position.x + workArea.size.width / 2) ? "left" : "right";
  const maxYOffset = Math.max(0, workArea.size.height - size.height);
  const anchorY = maxYOffset <= 0
    ? 0
    : clampAnchorY((position.y - workArea.position.y) / maxYOffset);

  return {
    side,
    anchor_y: anchorY,
  };
}

export function useWidgetWindowState(showObjectSlot: boolean) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [placement, setPlacementState] = useState<WidgetPlacement>(DEFAULT_WIDGET_PLACEMENT);
  const [expanded, setExpandedState] = useState(false);
  const dragTimerRef = useRef<number | null>(null);
  const expandedRef = useRef(false);
  const placementRef = useRef<WidgetPlacement>(DEFAULT_WIDGET_PLACEMENT);
  const showObjectSlotRef = useRef(showObjectSlot);
  const applyingRuntimeLayoutRef = useRef(false);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  const setPlacement = useCallback((nextPlacement: WidgetPlacement) => {
    const clampedPlacement = {
      side: nextPlacement.side,
      anchor_y: clampAnchorY(nextPlacement.anchor_y),
    };
    placementRef.current = clampedPlacement;
    setPlacementState(clampedPlacement);
  }, []);

  const clearDragTimer = useCallback(() => {
    if (dragTimerRef.current !== null) {
      window.clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
  }, []);

  const runRuntimeLayout = useCallback(async (
    nextPlacement: WidgetPlacement,
    nextExpanded: boolean,
    nextShowObjectSlot: boolean,
  ) => {
    applyingRuntimeLayoutRef.current = true;
    try {
      await applyWidgetLayout(
        nextPlacement.side,
        nextPlacement.anchor_y,
        nextExpanded,
        nextShowObjectSlot,
      );
    } finally {
      window.setTimeout(() => {
        applyingRuntimeLayoutRef.current = false;
      }, 0);
    }
  }, []);

  const expand = useCallback(() => {
    if (expandedRef.current) {
      return;
    }
    setExpandedState(true);
    void setWidgetExpanded(true, showObjectSlotRef.current).catch((error) => {
      console.warn("widget expand failed", error);
    });
  }, []);

  const collapse = useCallback(() => {
    if (!expandedRef.current) {
      return;
    }
    setExpandedState(false);
    void setWidgetExpanded(false, showObjectSlotRef.current).catch((error) => {
      console.warn("widget collapse failed", error);
    });
  }, []);

  const toggleExpanded = useCallback(() => {
    if (expandedRef.current) {
      collapse();
      return;
    }

    expand();
  }, [collapse, expand]);

  const finalizeMove = useCallback(async () => {
    const [position, size] = await Promise.all([
      appWindow.outerPosition().catch(() => null),
      appWindow.outerSize().catch(() => null),
    ]);
    if (!position || !size) {
      return;
    }

    const monitor = await resolveMonitorForWindowRect(position, size);
    if (!monitor) {
      return;
    }

    const nextPlacement = resolvePlacementFromWindowRect(monitor, position, size);
    setPlacement(nextPlacement);
    await runRuntimeLayout(nextPlacement, true, showObjectSlotRef.current).catch((error) => {
      console.warn("apply widget drag layout failed", error);
    });
  }, [appWindow, runRuntimeLayout, setPlacement]);

  useEffect(() => {
    const previousShowObjectSlot = showObjectSlotRef.current;
    showObjectSlotRef.current = showObjectSlot;

    if (!expandedRef.current || previousShowObjectSlot === showObjectSlot) {
      return;
    }

    void runRuntimeLayout(placementRef.current, true, showObjectSlot).catch((error) => {
      console.warn("apply widget slot layout failed", error);
    });
  }, [runRuntimeLayout, showObjectSlot]);

  useEffect(() => {
    let cancelled = false;
    const unlistenPromises: Array<Promise<() => void>> = [];

    void appWindow.setFocusable(true).catch((error) => {
      console.warn("widget set focusable failed", error);
    });

    void getWidgetPlacement()
      .then((loadedPlacement) => {
        if (cancelled || !loadedPlacement) {
          return;
        }
        setPlacement(loadedPlacement);
      })
      .catch((error) => {
        console.warn("load widget placement failed", error);
      });

    unlistenPromises.push(appWindow.onMoved(() => {
      if (applyingRuntimeLayoutRef.current || !expandedRef.current) {
        return;
      }
      clearDragTimer();
      dragTimerRef.current = window.setTimeout(() => {
        dragTimerRef.current = null;
        void finalizeMove();
      }, DRAG_SETTLE_MS);
    }));

    unlistenPromises.push(appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused && expandedRef.current) {
        collapse();
      }
    }));

    return () => {
      cancelled = true;
      clearDragTimer();
      for (const promise of unlistenPromises) {
        void promise.then((unlisten) => {
          unlisten();
        });
      }
    };
  }, [appWindow, clearDragTimer, collapse, finalizeMove, setPlacement]);

  return {
    collapse,
    expand,
    expanded,
    placement,
    toggleExpanded,
  };
}
