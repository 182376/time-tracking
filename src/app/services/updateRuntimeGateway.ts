import { invoke } from "@tauri-apps/api/core";
import { parseUpdateSnapshot, type UpdateSnapshot } from "../../shared/types/update";

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

export async function downloadAndInstallUpdate(): Promise<UpdateSnapshot> {
  const payload = await invoke<unknown>("cmd_download_and_install_update");
  return assertSnapshot(payload);
}
