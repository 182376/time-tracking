import { useEffect, useState } from "react";
import { Pause, Play, SquareArrowOutUpRight } from "lucide-react";
import QuietIconAction from "../../shared/components/QuietIconAction";
import { showMainWindow } from "../../platform/desktop/widgetRuntimeGateway";
import { toggleTrackingPaused } from "../../platform/runtime/trackingRuntimeGateway";
import type { TrackingStatusSnapshot, TrackingWindowSnapshot } from "../../shared/types/tracking";
import { useWindowTracking } from "../hooks/useWindowTracking";
import { useWidgetObjectIcon } from "../hooks/useWidgetObjectIcon";
import { useWidgetWindowState } from "./useWidgetWindowState";
import { buildWidgetViewModel, isWidgetSelfWindow } from "./widgetViewModel";

interface WidgetDisplaySnapshot {
  activeWindow: TrackingWindowSnapshot | null;
  trackingStatus: TrackingStatusSnapshot;
}

export default function WidgetShell() {
  const {
    activeWindow,
    trackingStatus,
    appSettings,
    classificationReady,
    trackerHealth,
  } = useWindowTracking({ syncDesktopLaunchBehavior: false });
  const [lastNonWidgetSnapshot, setLastNonWidgetSnapshot] = useState<WidgetDisplaySnapshot | null>(null);

  useEffect(() => {
    if (isWidgetSelfWindow(activeWindow)) {
      return;
    }

    setLastNonWidgetSnapshot({
      activeWindow,
      trackingStatus,
    });
  }, [activeWindow, trackingStatus]);

  const displaySnapshot = isWidgetSelfWindow(activeWindow) && lastNonWidgetSnapshot
    ? lastNonWidgetSnapshot
    : {
      activeWindow,
      trackingStatus,
    };

  const viewModel = classificationReady
    ? buildWidgetViewModel(
      displaySnapshot.activeWindow,
      displaySnapshot.trackingStatus,
      appSettings,
      trackerHealth,
    )
    : {
      statusTone: "idle" as const,
      statusLabel: "Loading",
      appName: "Widget",
      helperText: "Syncing status",
      pauseActionLabel: "Pause tracking",
      showObjectSlot: false,
      objectIconKey: null,
    };

  const statusTitle = `${viewModel.statusLabel} | ${viewModel.appName}`;
  const objectIcon = useWidgetObjectIcon(viewModel.objectIconKey);
  const showObjectSlot = viewModel.showObjectSlot && Boolean(objectIcon);
  const {
    expanded,
    placement,
    toggleExpanded,
  } = useWidgetWindowState(showObjectSlot);
  const objectSlotTitle = `Current app: ${viewModel.appName}`;

  return (
    <div
      className={`widget-shell widget-shell-${placement.side} ${
        expanded ? "widget-shell-expanded" : "widget-shell-collapsed"
      }`}
    >
      <div className={`widget-pill-shell qp-panel widget-pill-shell-${viewModel.statusTone}`}>
        {expanded && showObjectSlot ? (
          <>
            <div
              className="widget-pill-object-slot"
              aria-hidden={!expanded}
              title={objectSlotTitle}
            >
              <div
                className="widget-pill-object"
                aria-label={objectSlotTitle}
                role="img"
              >
                <img src={objectIcon ?? ""} className="widget-pill-object-icon" alt="" />
              </div>
            </div>
          </>
        ) : null}

        <div className="widget-pill-actions" aria-hidden={!expanded}>
          <QuietIconAction
            icon={appSettings.tracking_paused
              ? <Play size={15} strokeWidth={2} />
              : <Pause size={15} strokeWidth={2} />}
            title={viewModel.pauseActionLabel}
            ariaLabel={viewModel.pauseActionLabel}
            className="widget-pill-action"
            disabled={!expanded}
            onClick={() => {
              void toggleTrackingPaused().catch((error) => {
                console.warn("toggle tracking paused failed", error);
              });
            }}
          />

          <QuietIconAction
            icon={<SquareArrowOutUpRight size={15} strokeWidth={1.8} />}
            title="Open main window"
            ariaLabel="Open main window"
            className="widget-pill-action"
            disabled={!expanded}
            onClick={() => {
              void showMainWindow().catch((error) => {
                console.warn("show main window failed", error);
              });
            }}
          />
        </div>

        <button
          type="button"
          className={`widget-pill-anchor widget-pill-anchor-${viewModel.statusTone} ${
            expanded ? "widget-pill-anchor-expanded" : "widget-pill-anchor-collapsed"
          }`}
          aria-label={expanded ? "Collapse widget" : "Expand widget"}
          aria-expanded={expanded}
          onClick={toggleExpanded}
          title={statusTitle}
        >
          <span className={`widget-status-lamp widget-status-lamp-${viewModel.statusTone}`} />
        </button>
      </div>
    </div>
  );
}
