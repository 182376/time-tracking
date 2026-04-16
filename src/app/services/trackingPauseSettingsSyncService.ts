import { AppSettingsRuntimeService } from "./appSettingsRuntimeService";

export function shouldSyncTrackingPause(reason: string) {
  return reason === "tracking-paused" || reason === "tracking-resumed";
}

export async function loadLatestTrackingPauseSetting() {
  const latestSettings = await AppSettingsRuntimeService.loadLatestSettings();
  return latestSettings.tracking_paused;
}
