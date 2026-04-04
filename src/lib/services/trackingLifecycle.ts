export interface TrackedWindow {
  title: string;
  exe_name: string;
  process_path: string;
  is_afk: boolean;
  idle_time_ms: number;
}

export interface TrackingSettingsSnapshot {
  afk_timeout_secs: number;
  min_session_secs: number;
}

export interface WindowTransitionDecision {
  didChange: boolean;
  shouldEndPrevious: boolean;
  shouldStartNext: boolean;
  endTimeOverride?: number;
}

export interface ActiveSessionSnapshot {
  id: number;
  start_time: number;
}

export interface SessionFinalizationPlan {
  idsToDelete: number[];
}

export interface StartupSealTimeArgs {
  sessionStartTime: number;
  lastHeartbeatMs: number | null;
  nowMs: number;
}

export function isTrackableWindow(
  win: TrackedWindow | null,
  shouldTrack: (exeName: string) => boolean,
) {
  if (!win?.exe_name) return false;
  if (win.is_afk) return false;
  return shouldTrack(win.exe_name);
}

export function planWindowTransition(args: {
  previousWindow: TrackedWindow | null;
  nextWindow: TrackedWindow;
  settings: TrackingSettingsSnapshot;
  nowMs: number;
  shouldTrack: (exeName: string) => boolean;
}): WindowTransitionDecision {
  const { previousWindow, nextWindow, nowMs, shouldTrack } = args;
  const lastTrackable = isTrackableWindow(previousWindow, shouldTrack);
  const nextTrackable = isTrackableWindow(nextWindow, shouldTrack);
  const identityChanged =
    previousWindow?.exe_name !== nextWindow.exe_name ||
    previousWindow?.title !== nextWindow.title;
  const trackingStateChanged = lastTrackable !== nextTrackable;
  const didChange = identityChanged || trackingStateChanged;
  const shouldEndPrevious = lastTrackable && didChange;
  const shouldStartNext = nextTrackable && didChange;

  return {
    didChange,
    shouldEndPrevious,
    shouldStartNext,
    endTimeOverride:
      shouldEndPrevious && !nextTrackable && nextWindow.is_afk
        ? nowMs - nextWindow.idle_time_ms
        : undefined,
  };
}

export function planSessionFinalization(
  activeSessions: ActiveSessionSnapshot[],
  rawEndTime: number,
  minSessionSecs: number,
): SessionFinalizationPlan {
  if (minSessionSecs <= 0) {
    return { idsToDelete: [] };
  }

  const minDurationMs = minSessionSecs * 1000;
  const idsToDelete = activeSessions
    .filter((session) => Math.max(0, rawEndTime - session.start_time) < minDurationMs)
    .map((session) => session.id);

  return { idsToDelete };
}

export function resolveStartupSealTime(args: StartupSealTimeArgs) {
  const { sessionStartTime, lastHeartbeatMs, nowMs } = args;

  if (!Number.isFinite(lastHeartbeatMs ?? NaN)) {
    return nowMs;
  }

  return Math.min(nowMs, Math.max(sessionStartTime, lastHeartbeatMs!));
}
