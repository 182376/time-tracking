import { getAppVersion } from "../../../platform/desktop/appInfoGateway.ts";
import {
  loadAppSettings,
  type AppSettings,
} from "../../../platform/persistence/appSettingsStore.ts";
import {
  getSettingsBootstrapCache,
  setSettingsBootstrapCache,
} from "./settingsBootstrapCache.ts";

export interface SettingsPageBootstrapData {
  settings: AppSettings;
  appVersion: string;
}

type SettingsPageBootstrapDeps = {
  getAppVersion: () => Promise<string>;
  loadAppSettings: () => Promise<AppSettings>;
  setSettingsBootstrapCache: (bootstrap: SettingsPageBootstrapData) => void;
};

const settingsPageBootstrapDeps: SettingsPageBootstrapDeps = {
  getAppVersion: async () => getAppVersion().catch(() => "unknown"),
  loadAppSettings,
  setSettingsBootstrapCache,
};

export async function loadSettingsPageBootstrapWithDeps(
  deps: SettingsPageBootstrapDeps,
): Promise<SettingsPageBootstrapData> {
  const [settings, appVersion] = await Promise.all([
    deps.loadAppSettings(),
    deps.getAppVersion(),
  ]);

  const bootstrap = {
    settings,
    appVersion,
  };
  deps.setSettingsBootstrapCache(bootstrap);
  return bootstrap;
}

export async function loadSettingsPageBootstrap(): Promise<SettingsPageBootstrapData> {
  return loadSettingsPageBootstrapWithDeps(settingsPageBootstrapDeps);
}

export function getSettingsPageBootstrapCache(): SettingsPageBootstrapData | null {
  return getSettingsBootstrapCache();
}

export async function prewarmSettingsBootstrapCache(): Promise<SettingsPageBootstrapData> {
  return loadSettingsPageBootstrap();
}
