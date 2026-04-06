import { invoke } from "@tauri-apps/api/core";
import type { CloseBehavior, MinimizeBehavior } from "../../lib/settings-store";

export async function setDesktopBehavior(
  closeBehavior: CloseBehavior,
  minimizeBehavior: MinimizeBehavior,
): Promise<void> {
  await invoke("cmd_set_desktop_behavior", {
    closeBehavior,
    minimizeBehavior,
  });
}

export async function setLaunchBehavior(
  launchAtLogin: boolean,
  startMinimized: boolean,
): Promise<void> {
  await invoke("cmd_set_launch_behavior", { launchAtLogin, startMinimized });
}
