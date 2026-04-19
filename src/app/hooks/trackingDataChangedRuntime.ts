import type { AppSettings } from "../../shared/settings/appSettings";
import type {
  CurrentTrackingSnapshot,
  TrackingDataChangedPayload,
  TrackingStatusSnapshot,
  TrackingWindowSnapshot,
} from "../../shared/types/tracking";
import type { TrackingDataChangedEffects } from "./trackingDataChangedPolicy.ts";
import { resolveTrackingDataChangedEffects } from "./trackingDataChangedPolicy.ts";

type TrackingDataChangedRuntimeDeps = {
  loadLatestTrackingPauseSetting: () => Promise<boolean>;
  loadCurrentWindowSnapshot?: () => Promise<TrackingWindowSnapshot | null>;
  loadCurrentTrackingSnapshot?: () => Promise<CurrentTrackingSnapshot | null>;
  setAppSettings: (updater: (current: AppSettings) => AppSettings) => void;
  setActiveWindow?: (nextWindow: TrackingWindowSnapshot | null) => void;
  setTrackingStatus?: (nextStatus: TrackingStatusSnapshot) => void;
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
    loadCurrentWindowSnapshot,
    loadCurrentTrackingSnapshot,
    setAppSettings,
    setActiveWindow,
    setTrackingStatus,
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

  if (effects.shouldRefresh && loadCurrentTrackingSnapshot && setActiveWindow && setTrackingStatus) {
    try {
      const nextSnapshot = await loadCurrentTrackingSnapshot();
      setActiveWindow(nextSnapshot?.window ?? null);
      setTrackingStatus(nextSnapshot?.status ?? {
        is_tracking_active: false,
        sustained_participation_eligible: false,
        sustained_participation_active: false,
        sustained_participation_kind: null,
      });
    } catch (error) {
      warn("Failed to sync tracking snapshot", error);
    }
  } else if (effects.shouldRefresh && loadCurrentWindowSnapshot && setActiveWindow) {
    try {
      const nextWindow = await loadCurrentWindowSnapshot();
      setActiveWindow(nextWindow);
    } catch (error) {
      warn("Failed to sync active window snapshot", error);
    }
  }

  if (effects.shouldRefresh) {
    bumpSyncTick();
  }
}
