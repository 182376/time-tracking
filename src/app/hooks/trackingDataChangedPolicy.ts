const SEALED_REFRESH_ONLY_REASONS = new Set([
  "watchdog-sealed",
  "startup-sealed",
  "tracking-paused-sealed",
  "continuity-window-sealed",
  "passive-participation-sealed",
  "backup-restored",
]);
const PAUSE_TOGGLE_REASONS = new Set([
  "tracking-paused",
  "tracking-resumed",
]);

export type TrackingDataChangedEffects = {
  shouldRefresh: boolean;
  shouldSyncPauseSetting: boolean;
};

export function resolveTrackingDataChangedEffects(reason: string): TrackingDataChangedEffects {
  if (SEALED_REFRESH_ONLY_REASONS.has(reason)) {
    return {
      shouldRefresh: true,
      shouldSyncPauseSetting: false,
    };
  }

  return {
    shouldRefresh: true,
    shouldSyncPauseSetting: PAUSE_TOGGLE_REASONS.has(reason),
  };
}
