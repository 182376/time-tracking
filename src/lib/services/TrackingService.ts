import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import {
  type TrackingDataChangedPayload,
  type TrackingWindowSnapshot,
  parseTrackingDataChangedPayload,
  parseTrackingWindowSnapshot,
} from "../../types/tracking";

export class TrackingService {
  static async getCurrentWindow() {
    try {
      const payload = await invoke<unknown>("get_current_active_window");
      return parseTrackingWindowSnapshot(payload);
    } catch {
      return null;
    }
  }

  static async setAfkTimeout(timeoutSecs: number) {
    await invoke("cmd_set_afk_timeout", { timeoutSecs });
  }

  static async onActiveWindowChanged(
    handler: (window: TrackingWindowSnapshot) => void | Promise<void>,
  ) {
    return listen<unknown>("active-window-changed", (event: Event<unknown>) => {
      const payload = parseTrackingWindowSnapshot(event.payload);
      if (!payload) {
        console.warn("Ignored invalid active-window payload", event.payload);
        return;
      }

      void handler(payload);
    });
  }

  static async onTrackingDataChanged(
    handler: (payload: TrackingDataChangedPayload) => void | Promise<void>,
  ) {
    return listen<unknown>("tracking-data-changed", (event: Event<unknown>) => {
      const payload = parseTrackingDataChangedPayload(event.payload);
      if (!payload) {
        console.warn("Ignored invalid tracking-data payload", event.payload);
        return;
      }

      void handler(payload);
    });
  }
}
