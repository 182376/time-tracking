import type { TrackerHealthSnapshot } from "../../shared/types/tracking";
import { loadTrackerHealthSnapshot } from "./appRuntimeBootstrapService";

const TRACKER_HEARTBEAT_POLL_MS = 1_000;

export function startTrackerHealthPolling(
  onSnapshot: (snapshot: TrackerHealthSnapshot) => void,
) {
  let disposed = false;

  const refreshTrackerHealth = async () => {
    const snapshot = await loadTrackerHealthSnapshot(Date.now());
    if (!disposed) {
      onSnapshot(snapshot);
    }
  };

  const timerId = window.setInterval(() => {
    void refreshTrackerHealth();
  }, TRACKER_HEARTBEAT_POLL_MS);

  return () => {
    disposed = true;
    window.clearInterval(timerId);
  };
}
