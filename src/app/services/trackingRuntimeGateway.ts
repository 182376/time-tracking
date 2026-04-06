import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import {
  type TrackingDataChangedPayload,
  type TrackingWindowSnapshot,
  parseTrackingDataChangedPayload,
  parseTrackingWindowSnapshot,
} from "../../types/tracking";

export async function getCurrentWindow(): Promise<TrackingWindowSnapshot | null> {
  try {
    const payload = await invoke<unknown>("get_current_active_window");
    return parseTrackingWindowSnapshot(payload);
  } catch {
    return null;
  }
}

export async function setAfkTimeout(timeoutSecs: number): Promise<void> {
  await invoke("cmd_set_afk_timeout", { timeoutSecs });
}

export async function onActiveWindowChanged(
  handler: (window: TrackingWindowSnapshot) => void | Promise<void>,
): Promise<() => void> {
  return listen<unknown>("active-window-changed", (event: Event<unknown>) => {
    const payload = parseTrackingWindowSnapshot(event.payload);
    if (!payload) {
      console.warn("Ignored invalid active-window payload", event.payload);
      return;
    }

    void handler(payload);
  });
}

export async function onTrackingDataChanged(
  handler: (payload: TrackingDataChangedPayload) => void | Promise<void>,
): Promise<() => void> {
  return listen<unknown>("tracking-data-changed", (event: Event<unknown>) => {
    const payload = parseTrackingDataChangedPayload(event.payload);
    if (!payload) {
      console.warn("Ignored invalid tracking-data payload", event.payload);
      return;
    }

    void handler(payload);
  });
}
