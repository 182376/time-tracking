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
export type SustainedParticipationSignalSource = "system-media" | "audio-session";
export type SustainedParticipationState =
  | "inactive"
  | "candidate"
  | "active"
  | "grace"
  | "expired";
export type SustainedParticipationStatusReason =
  | "no-signal"
  | "tracking-paused"
  | "empty-window"
  | "not-eligible"
  | "signal-inactive"
  | "identity-mismatch"
  | "signal-matched"
  | "grace-window"
  | "grace-expired"
  | "sustained-window-expired";
export type SustainedParticipationAppIdentity =
  | "chrome"
  | "edge"
  | "firefox"
  | "brave"
  | "zoom"
  | "teams"
  | "vlc"
  | "bilibili"
  | "douyin"
  | "we-meet";
export type SustainedParticipationSignalMatchResult =
  | "unavailable"
  | "inactive"
  | "identity-mismatch"
  | "matched";

export interface SustainedParticipationSignalSnapshot {
  is_available: boolean;
  is_active: boolean;
  signal_source: SustainedParticipationSignalSource | null;
  source_app_id: string | null;
  source_app_identity: SustainedParticipationAppIdentity | null;
  playback_type: "unknown" | "audio" | "video" | "image" | null;
}

export interface SustainedParticipationSignalEvaluationSnapshot {
  signal: SustainedParticipationSignalSnapshot;
  match_result: SustainedParticipationSignalMatchResult;
}

export interface SustainedParticipationDiagnosticsSnapshot {
  state: SustainedParticipationState;
  reason: SustainedParticipationStatusReason;
  window_identity: SustainedParticipationAppIdentity | null;
  effective_signal_source: SustainedParticipationSignalSource | null;
  last_match_at_ms: number | null;
  grace_deadline_ms: number | null;
  system_media: SustainedParticipationSignalEvaluationSnapshot;
  audio_session: SustainedParticipationSignalEvaluationSnapshot;
}

export interface TrackingStatusSnapshot {
  is_tracking_active: boolean;
  sustained_participation_eligible: boolean;
  sustained_participation_active: boolean;
  sustained_participation_kind: SustainedParticipationKind | null;
  sustained_participation_state: SustainedParticipationState;
  sustained_participation_signal_source: SustainedParticipationSignalSource | null;
  sustained_participation_reason: SustainedParticipationStatusReason;
  sustained_participation_diagnostics: SustainedParticipationDiagnosticsSnapshot;
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

function isEnumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
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
    )
    && isEnumValue(value.sustained_participation_state, [
      "inactive",
      "candidate",
      "active",
      "grace",
      "expired",
    ] as const)
    && (
      value.sustained_participation_signal_source === null
      || value.sustained_participation_signal_source === "system-media"
      || value.sustained_participation_signal_source === "audio-session"
    )
    && isEnumValue(value.sustained_participation_reason, [
      "no-signal",
      "tracking-paused",
      "empty-window",
      "not-eligible",
      "signal-inactive",
      "identity-mismatch",
      "signal-matched",
      "grace-window",
      "grace-expired",
      "sustained-window-expired",
    ] as const)
    && isSustainedParticipationDiagnosticsSnapshot(value.sustained_participation_diagnostics);
}

export function isSustainedParticipationSignalSnapshot(
  value: unknown,
): value is SustainedParticipationSignalSnapshot {
  return isRecord(value)
    && typeof value.is_available === "boolean"
    && typeof value.is_active === "boolean"
    && (
      value.signal_source === null
      || value.signal_source === "system-media"
      || value.signal_source === "audio-session"
    )
    && (value.source_app_id === null || typeof value.source_app_id === "string")
    && (
      value.source_app_identity === null
      || isEnumValue(value.source_app_identity, [
        "chrome",
        "edge",
        "firefox",
        "brave",
        "zoom",
        "teams",
        "vlc",
        "bilibili",
        "douyin",
        "we-meet",
      ] as const)
    )
    && (
      value.playback_type === null
      || isEnumValue(value.playback_type, [
        "unknown",
        "audio",
        "video",
        "image",
      ] as const)
    );
}

export function isSustainedParticipationSignalEvaluationSnapshot(
  value: unknown,
): value is SustainedParticipationSignalEvaluationSnapshot {
  return isRecord(value)
    && isSustainedParticipationSignalSnapshot(value.signal)
    && isEnumValue(value.match_result, [
      "unavailable",
      "inactive",
      "identity-mismatch",
      "matched",
    ] as const);
}

export function isSustainedParticipationDiagnosticsSnapshot(
  value: unknown,
): value is SustainedParticipationDiagnosticsSnapshot {
  return isRecord(value)
    && isEnumValue(value.state, [
      "inactive",
      "candidate",
      "active",
      "grace",
      "expired",
    ] as const)
    && isEnumValue(value.reason, [
      "no-signal",
      "tracking-paused",
      "empty-window",
      "not-eligible",
      "signal-inactive",
      "identity-mismatch",
      "signal-matched",
      "grace-window",
      "grace-expired",
      "sustained-window-expired",
    ] as const)
    && (
      value.window_identity === null
      || isEnumValue(value.window_identity, [
        "chrome",
        "edge",
        "firefox",
        "brave",
        "zoom",
        "teams",
        "vlc",
        "bilibili",
        "douyin",
        "we-meet",
      ] as const)
    )
    && (
      value.effective_signal_source === null
      || value.effective_signal_source === "system-media"
      || value.effective_signal_source === "audio-session"
    )
    && (value.last_match_at_ms === null || typeof value.last_match_at_ms === "number")
    && (value.grace_deadline_ms === null || typeof value.grace_deadline_ms === "number")
    && isSustainedParticipationSignalEvaluationSnapshot(value.system_media)
    && isSustainedParticipationSignalEvaluationSnapshot(value.audio_session);
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
