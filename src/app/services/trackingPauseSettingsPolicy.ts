export function shouldSyncTrackingPause(reason: string) {
  return reason === "tracking-paused" || reason === "tracking-resumed";
}
