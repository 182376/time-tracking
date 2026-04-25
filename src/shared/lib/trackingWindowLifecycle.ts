import type { TrackedWindow } from "../types/tracking";

export interface WindowTransitionDecision {
  didChange: boolean;
  reason: string;
  shouldEndPrevious: boolean;
  shouldStartNext: boolean;
  shouldRefreshMetadata: boolean;
  endTimeOverride?: number;
}

export interface WindowSessionIdentity {
  appKey: string;
  instanceKey: string;
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
  if (!win?.exeName) return false;
  if (win.isAfk) return false;
  return shouldTrack(win.exeName);
}

export function resolveWindowSessionIdentity(
  win: TrackedWindow | null,
  shouldTrack: (exeName: string) => boolean,
): WindowSessionIdentity | null {
  if (!win || !isTrackableWindow(win, shouldTrack)) {
    return null;
  }

  const appKey = win.exeName.toLowerCase();
  const rootOwnerKey = win.rootOwnerHwnd || win.hwnd;
  const classKey = win.windowClass.toLowerCase();

  return {
    appKey,
    instanceKey: `${appKey}|pid:${win.processId}|root:${rootOwnerKey}|class:${classKey}`,
  };
}

export function planWindowTransition(args: {
  previousWindow: TrackedWindow | null;
  nextWindow: TrackedWindow;
  nowMs: number;
  shouldTrack: (exeName: string) => boolean;
}): WindowTransitionDecision {
  const { previousWindow, nextWindow, nowMs, shouldTrack } = args;
  const lastTrackable = isTrackableWindow(previousWindow, shouldTrack);
  const nextTrackable = isTrackableWindow(nextWindow, shouldTrack);
  const previousIdentity = resolveWindowSessionIdentity(previousWindow, shouldTrack);
  const nextIdentity = resolveWindowSessionIdentity(nextWindow, shouldTrack);
  const appChanged = previousIdentity?.appKey !== nextIdentity?.appKey;
  const instanceChanged = previousIdentity?.instanceKey !== nextIdentity?.instanceKey;
  const trackingStateChanged = lastTrackable !== nextTrackable;
  const didChange = appChanged || trackingStateChanged;
  const shouldEndPrevious = lastTrackable && didChange;
  const shouldStartNext = nextTrackable && didChange;
  const titleChanged = previousWindow?.title !== nextWindow.title;
  const shouldRefreshMetadata = !didChange
    && nextTrackable
    && (titleChanged || instanceChanged);

  return {
    didChange,
    reason: appChanged
      ? "session-transition-app-change"
      : trackingStateChanged
        ? "session-transition-state-change"
        : shouldRefreshMetadata
          ? "session-metadata-refreshed"
          : instanceChanged
            ? "session-instance-unchanged-app"
            : "session-no-change",
    shouldEndPrevious,
    shouldStartNext,
    shouldRefreshMetadata,
    endTimeOverride:
      shouldEndPrevious && !nextTrackable && nextWindow.isAfk
        ? nowMs - nextWindow.idleTimeMs
        : undefined,
  };
}

export function resolveStartupSealTime(args: StartupSealTimeArgs) {
  const { sessionStartTime, lastHeartbeatMs, nowMs } = args;

  if (!Number.isFinite(lastHeartbeatMs ?? NaN)) {
    return nowMs;
  }

  return Math.min(nowMs, Math.max(sessionStartTime, lastHeartbeatMs!));
}
