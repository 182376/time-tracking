import { type MouseEvent } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import appIconUrl from "../../../src-tauri/icons/32x32.png";
import {
  closeCurrentWindow,
  minimizeCurrentWindow,
  startCurrentWindowDrag,
  toggleCurrentWindowMaximized,
} from "../../platform/desktop/windowControlGateway";

const APP_TITLE = "Time Tracker";

type AppTitleBarProps = {
  isMaximized: boolean;
};

function runWindowAction(action: () => Promise<void>, actionName: string) {
  void action().catch((error) => {
    console.warn(`${actionName} failed`, error);
  });
}

export default function AppTitleBar({ isMaximized }: AppTitleBarProps) {
  const handleDragMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) {
      return;
    }

    runWindowAction(startCurrentWindowDrag, "start window drag");
  };

  const handleDragDoubleClick = () => {
    runWindowAction(toggleCurrentWindowMaximized, "toggle window maximize");
  };

  return (
    <header className="app-titlebar" aria-label={APP_TITLE}>
      <div className="app-titlebar-brand">
        <span className="app-titlebar-mark" aria-hidden>
          <img className="app-titlebar-icon" src={appIconUrl} alt="" draggable={false} />
        </span>
        <span className="app-titlebar-name">{APP_TITLE}</span>
      </div>

      <div
        className="app-titlebar-drag-region"
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleDragDoubleClick}
      />

      <div className="app-titlebar-controls">
        <button
          type="button"
          className="app-titlebar-button"
          aria-label="最小化窗口"
          onClick={() => runWindowAction(minimizeCurrentWindow, "minimize current window")}
        >
          <Minus size={13} strokeWidth={2.1} />
        </button>
        <button
          type="button"
          className="app-titlebar-button"
          aria-label={isMaximized ? "还原窗口" : "最大化窗口"}
          onClick={() => runWindowAction(toggleCurrentWindowMaximized, "toggle window maximize")}
        >
          {isMaximized ? (
            <Minimize2 size={12} strokeWidth={2} />
          ) : (
            <Maximize2 size={12} strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          className="app-titlebar-button app-titlebar-close"
          aria-label="关闭窗口"
          onClick={() => runWindowAction(closeCurrentWindow, "close current window")}
        >
          <X size={13} strokeWidth={2.1} />
        </button>
      </div>
    </header>
  );
}
