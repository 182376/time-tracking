import type { SettingsPageBootstrapData } from "./settingsRuntimeAdapterService";

let SETTINGS_BOOTSTRAP_CACHE: SettingsPageBootstrapData | null = null;

export function getSettingsBootstrapCache(): SettingsPageBootstrapData | null {
  return SETTINGS_BOOTSTRAP_CACHE;
}

export function setSettingsBootstrapCache(snapshot: SettingsPageBootstrapData | null): void {
  SETTINGS_BOOTSTRAP_CACHE = snapshot;
}
