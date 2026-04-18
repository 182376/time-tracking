import { loadSettings } from "../../shared/lib/settingsPersistenceAdapter.ts";

export async function loadLatestTrackingPauseSetting() {
  const latestSettings = await loadSettings();
  return latestSettings.tracking_paused;
}
