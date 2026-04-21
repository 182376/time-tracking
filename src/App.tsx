import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";
import "./App.css";
import AppShell from "./app/AppShell";
import WidgetShell from "./app/widget/WidgetShell";
import { hideWidgetWindow } from "./platform/desktop/widgetRuntimeGateway";

const CURRENT_WINDOW_LABEL = (() => {
  try {
    const windowLabel = getCurrentWindow().label;
    const webviewLabel = getCurrentWebviewWindow().label;
    return windowLabel === "widget" || webviewLabel === "widget"
      ? "widget"
      : "main";
  } catch {
    return "main";
  }
})();

if (typeof document !== "undefined") {
  document.documentElement.dataset.windowLabel = CURRENT_WINDOW_LABEL;
  document.body?.setAttribute("data-window-label", CURRENT_WINDOW_LABEL);
  document.getElementById("root")?.setAttribute("data-window-label", CURRENT_WINDOW_LABEL);
}

export default function App() {
  useEffect(() => {
    if (CURRENT_WINDOW_LABEL !== "main") {
      return;
    }

    let active = true;
    const currentWindow = getCurrentWindow();

    const requestHideWidget = () => {
      void hideWidgetWindow().catch((error) => {
        if (active) {
          console.warn("hide widget window failed", error);
        }
      });
    };

    const syncWidgetVisibility = () => {
      void currentWindow
        .isVisible()
        .then((visible) => {
          if (!active || !visible) {
            return false;
          }
          return currentWindow.isFocused();
        })
        .then((focused) => {
          if (focused) {
            requestHideWidget();
          }
        })
        .catch((error) => {
          if (active) {
            console.warn("sync widget visibility failed", error);
          }
        });
    };

    const handleFocus = () => {
      syncWidgetVisibility();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncWidgetVisibility();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return CURRENT_WINDOW_LABEL === "widget" ? <WidgetShell /> : <AppShell />;
}
