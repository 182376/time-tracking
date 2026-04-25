import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { parseUpdateSnapshot } from "./updateRawDtos.ts";
import type { UpdateSnapshot } from "../../shared/types/update.ts";

function assertSnapshot(payload: unknown): UpdateSnapshot {
  const parsed = parseUpdateSnapshot(payload);
  if (!parsed) {
    throw new Error("Received invalid update snapshot payload");
  }
  return parsed;
}

export async function getUpdateSnapshot(): Promise<UpdateSnapshot> {
  const payload = await invoke<unknown>("cmd_get_update_snapshot");
  return assertSnapshot(payload);
}

export async function checkForUpdates(silent: boolean): Promise<UpdateSnapshot> {
  const payload = await invoke<unknown>("cmd_check_for_updates", { silent });
  return assertSnapshot(payload);
}

export async function downloadUpdate(): Promise<UpdateSnapshot> {
  const payload = await invoke<unknown>("cmd_download_update");
  return assertSnapshot(payload);
}

export async function installUpdate(): Promise<UpdateSnapshot> {
  const payload = await invoke<unknown>("cmd_install_update");
  return assertSnapshot(payload);
}

export async function onUpdateSnapshotChanged(
  handler: (snapshot: UpdateSnapshot) => void | Promise<void>,
): Promise<() => void> {
  return listen<unknown>("update-snapshot-changed", (event: Event<unknown>) => {
    const payload = parseUpdateSnapshot(event.payload);
    if (!payload) {
      console.warn("Ignored invalid update snapshot payload", event.payload);
      return;
    }

    void handler(payload);
  });
}
