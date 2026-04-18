import type { AppSettings } from "../../shared/settings/appSettings";
import type { TrackingDataChangedPayload } from "../../shared/types/tracking";
import type { TrackingDataChangedEffects } from "./trackingDataChangedPolicy.ts";
import { resolveTrackingDataChangedEffects } from "./trackingDataChangedPolicy.ts";

type TrackingDataChangedRuntimeDeps = {
  loadLatestTrackingPauseSetting: () => Promise<boolean>;
  setAppSettings: (updater: (current: AppSettings) => AppSettings) => void;
  bumpSyncTick: () => void;
  warn: (message: string, error: unknown) => void;
  resolveEffects?: (reason: string) => TrackingDataChangedEffects;
};

export async function applyTrackingDataChangedPayload(
  payload: TrackingDataChangedPayload,
  deps: TrackingDataChangedRuntimeDeps,
) {
  const {
    loadLatestTrackingPauseSetting,
    setAppSettings,
    bumpSyncTick,
    warn,
    resolveEffects = resolveTrackingDataChangedEffects,
  } = deps;
  const effects = resolveEffects(payload.reason);

  if (effects.shouldSyncPauseSetting) {
    try {
      const trackingPaused = await loadLatestTrackingPauseSetting();
      setAppSettings((current) => ({
        ...current,
        tracking_paused: trackingPaused,
      }));
    } catch (error) {
      warn("Failed to sync tracking pause setting", error);
    }
  }

  if (effects.shouldRefresh) {
    bumpSyncTick();
  }
}
