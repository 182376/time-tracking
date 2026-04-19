export interface TrackedWindow {
  hwnd: string;
  root_owner_hwnd: string;
  process_id: number;
  window_class: string;
  title: string;
  exe_name: string;
  process_path: string;
  is_afk: boolean;
  idle_time_ms: number;
}

export type TrackingWindowSnapshot = TrackedWindow;

export type SustainedParticipationKind = "video" | "meeting";

export interface TrackingStatusSnapshot {
  is_tracking_active: boolean;
  sustained_participation_eligible: boolean;
  sustained_participation_active: boolean;
  sustained_participation_kind: SustainedParticipationKind | null;
}

export interface CurrentTrackingSnapshot {
  window: TrackingWindowSnapshot;
  status: TrackingStatusSnapshot;
}

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

export function isTrackingStatusSnapshot(value: unknown): value is TrackingStatusSnapshot {
  return isRecord(value)
    && typeof value.is_tracking_active === "boolean"
    && typeof value.sustained_participation_eligible === "boolean"
    && typeof value.sustained_participation_active === "boolean"
    && (
      value.sustained_participation_kind === null
      || value.sustained_participation_kind === "video"
      || value.sustained_participation_kind === "meeting"
    );
}

export function isCurrentTrackingSnapshot(value: unknown): value is CurrentTrackingSnapshot {
  return isRecord(value)
    && isTrackingWindowSnapshot(value.window)
    && isTrackingStatusSnapshot(value.status);
}

export function isTrackingDataChangedPayload(value: unknown): value is TrackingDataChangedPayload {
  return isRecord(value)
    && typeof value.reason === "string"
    && typeof value.changed_at_ms === "number";
}

export function parseTrackingWindowSnapshot(value: unknown): TrackingWindowSnapshot | null {
  return isTrackingWindowSnapshot(value) ? value : null;
}

export function parseCurrentTrackingSnapshot(value: unknown): CurrentTrackingSnapshot | null {
  return isCurrentTrackingSnapshot(value) ? value : null;
}

export function parseTrackingDataChangedPayload(value: unknown): TrackingDataChangedPayload | null {
  return isTrackingDataChangedPayload(value) ? value : null;
}
