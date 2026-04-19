import { SettingsRuntimeAdapterService } from "../../features/settings/services/settingsRuntimeAdapterService.ts";

export async function loadLatestTrackingPauseSetting() {
  return SettingsRuntimeAdapterService.loadLatestTrackingPauseSetting();
}
