import type { TrackedWindow } from "../lib/services/trackingLifecycle";

export interface TrackingWindowSnapshot extends TrackedWindow {}

export interface TrackingDataChangedPayload {
  reason: string;
  changed_at_ms: number;
}

export type TrackerHealthStatus = "healthy" | "stale";

export interface TrackerHealthSnapshot {
  status: TrackerHealthStatus;
  lastHeartbeatMs: number | null;
  checkedAtMs: number;
  staleAfterMs: number;
}

export function resolveTrackerHealth(
  lastHeartbeatMs: number | null,
  checkedAtMs: number,
  staleAfterMs: number,
): TrackerHealthSnapshot {
  const isHealthy = lastHeartbeatMs !== null && (checkedAtMs - lastHeartbeatMs) <= staleAfterMs;

  return {
    status: isHealthy ? "healthy" : "stale",
    lastHeartbeatMs,
    checkedAtMs,
    staleAfterMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTrackingWindowSnapshot(value: unknown): value is TrackingWindowSnapshot {
  return isRecord(value)
    && typeof value.hwnd === "string"
    && typeof value.root_owner_hwnd === "string"
    && typeof value.process_id === "number"
    && typeof value.window_class === "string"
    && typeof value.title === "string"
    && typeof value.exe_name === "string"
    && typeof value.process_path === "string"
    && typeof value.is_afk === "boolean"
    && typeof value.idle_time_ms === "number";
}

export function isTrackingDataChangedPayload(value: unknown): value is TrackingDataChangedPayload {
  return isRecord(value)
    && typeof value.reason === "string"
    && typeof value.changed_at_ms === "number";
}

export function parseTrackingWindowSnapshot(value: unknown): TrackingWindowSnapshot | null {
  return isTrackingWindowSnapshot(value) ? value : null;
}

export function parseTrackingDataChangedPayload(value: unknown): TrackingDataChangedPayload | null {
  return isTrackingDataChangedPayload(value) ? value : null;
}
