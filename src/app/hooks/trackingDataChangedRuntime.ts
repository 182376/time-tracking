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
        sustained_participation_state: "inactive",
        sustained_participation_signal_source: null,
        sustained_participation_reason: "no-signal",
        sustained_participation_diagnostics: {
          state: "inactive",
          reason: "no-signal",
          window_identity: null,
          effective_signal_source: null,
          last_match_at_ms: null,
          grace_deadline_ms: null,
          system_media: {
            signal: {
              is_available: false,
              is_active: false,
              signal_source: null,
              source_app_id: null,
              source_app_identity: null,
              playback_type: null,
            },
            match_result: "unavailable",
          },
          audio_session: {
            signal: {
              is_available: false,
              is_active: false,
              signal_source: null,
              source_app_id: null,
              source_app_identity: null,
              playback_type: null,
            },
            match_result: "unavailable",
          },
        },
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
