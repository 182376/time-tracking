import type {
  RawPowerState,
  RawPresenceState,
  RawEventSource,
} from "../rawEvents";

export interface RawWindowEventRecord {
  id: number;
  timestamp_ms: number;
  exe_name: string;
  window_title: string;
  process_path: string;
  source: RawEventSource | string;
}

export interface RawPresenceEventRecord {
  id: number;
  timestamp_ms: number;
  state: RawPresenceState;
  idle_time_ms: number;
  source: RawEventSource | string;
}

export interface RawPowerEventRecord {
  id: number;
  timestamp_ms: number;
  state: RawPowerState;
  source: RawEventSource | string;
}

interface WindowSegment {
  start_time_ms: number;
  end_time_ms: number;
  exe_name: string;
  window_title: string;
  process_path: string;
  source_window_start_id: number;
  source_window_end_id: number;
  cut_reason: string;
}

interface PresenceSegment {
  start_time_ms: number;
  end_time_ms: number;
  state: RawPresenceState;
  source_presence_start_id: number;
  source_presence_end_id: number;
  cut_reason: string;
}

interface PowerAvailabilitySegment {
  start_time_ms: number;
  end_time_ms: number;
  cut_reason: string;
}

interface CandidateSession {
  start_time_ms: number;
  end_time_ms: number;
  exe_name: string;
  window_title: string;
  process_path: string;
  cut_reason: string;
  source_window_start_id: number;
  source_window_end_id: number;
  source_presence_start_id: number;
  source_presence_end_id: number;
}

export interface DerivedSessionRecord {
  start_time_ms: number;
  end_time_ms: number;
  duration_ms: number;
  exe_name: string;
  window_title: string;
  process_path: string;
  cut_reason: string;
  source_window_start_id: number;
  source_window_end_id: number;
  source_presence_start_id: number;
  source_presence_end_id: number;
}

function sameWindowIdentity(a: RawWindowEventRecord, b: RawWindowEventRecord) {
  return (
    a.exe_name === b.exe_name &&
    a.window_title === b.window_title &&
    a.process_path === b.process_path
  );
}

function samePresenceState(a: RawPresenceEventRecord, b: RawPresenceEventRecord) {
  return a.state === b.state;
}

function buildWindowSegments(
  events: RawWindowEventRecord[],
  nowMs: number,
): WindowSegment[] {
  const sorted = [...events].sort((a, b) => a.timestamp_ms - b.timestamp_ms || a.id - b.id);
  const segments: WindowSegment[] = [];
  let i = 0;

  while (i < sorted.length) {
    const start = sorted[i];
    let j = i;

    while (j + 1 < sorted.length && sameWindowIdentity(sorted[j], sorted[j + 1])) {
      j += 1;
    }

    const rawEndTime =
      j + 1 < sorted.length ? sorted[j + 1].timestamp_ms : nowMs;
    const end_time_ms = Math.max(start.timestamp_ms, rawEndTime);

    segments.push({
      start_time_ms: start.timestamp_ms,
      end_time_ms,
      exe_name: start.exe_name,
      window_title: start.window_title,
      process_path: start.process_path,
      source_window_start_id: start.id,
      source_window_end_id: sorted[j].id,
      cut_reason: j + 1 < sorted.length ? "window_change" : "timeline_end",
    });

    i = j + 1;
  }

  return segments;
}

function buildPresenceSegments(
  events: RawPresenceEventRecord[],
  nowMs: number,
): PresenceSegment[] {
  const sorted = [...events].sort((a, b) => a.timestamp_ms - b.timestamp_ms || a.id - b.id);
  const segments: PresenceSegment[] = [];
  let i = 0;

  while (i < sorted.length) {
    const start = sorted[i];
    let j = i;

    while (j + 1 < sorted.length && samePresenceState(sorted[j], sorted[j + 1])) {
      j += 1;
    }

    const rawEndTime =
      j + 1 < sorted.length ? sorted[j + 1].timestamp_ms : nowMs;
    const end_time_ms = Math.max(start.timestamp_ms, rawEndTime);
    const nextState = j + 1 < sorted.length ? sorted[j + 1].state : null;

    segments.push({
      start_time_ms: start.timestamp_ms,
      end_time_ms,
      state: start.state,
      source_presence_start_id: start.id,
      source_presence_end_id: sorted[j].id,
      cut_reason:
        nextState === "idle"
          ? "idle"
          : nextState === "active"
            ? "active"
            : "timeline_end",
    });

    i = j + 1;
  }

  return segments;
}

function intersectTrackableWindowsWithPresence(
  windowSegments: WindowSegment[],
  presenceSegments: PresenceSegment[],
  shouldTrack: (exeName: string) => boolean,
): CandidateSession[] {
  const sessions: CandidateSession[] = [];
  let windowIndex = 0;
  let presenceIndex = 0;

  while (windowIndex < windowSegments.length && presenceIndex < presenceSegments.length) {
    const windowSegment = windowSegments[windowIndex];
    const presenceSegment = presenceSegments[presenceIndex];

    const overlapStart = Math.max(
      windowSegment.start_time_ms,
      presenceSegment.start_time_ms,
    );
    const overlapEnd = Math.min(
      windowSegment.end_time_ms,
      presenceSegment.end_time_ms,
    );

    if (
      shouldTrack(windowSegment.exe_name) &&
      presenceSegment.state === "active" &&
      overlapStart < overlapEnd
    ) {
      const cut_reason =
        windowSegment.end_time_ms < presenceSegment.end_time_ms
          ? windowSegment.cut_reason
          : presenceSegment.end_time_ms < windowSegment.end_time_ms
            ? presenceSegment.cut_reason
            : presenceSegment.cut_reason !== "timeline_end"
              ? presenceSegment.cut_reason
              : windowSegment.cut_reason;

      sessions.push({
        start_time_ms: overlapStart,
        end_time_ms: overlapEnd,
        exe_name: windowSegment.exe_name,
        window_title: windowSegment.window_title,
        process_path: windowSegment.process_path,
        cut_reason,
        source_window_start_id: windowSegment.source_window_start_id,
        source_window_end_id: windowSegment.source_window_end_id,
        source_presence_start_id: presenceSegment.source_presence_start_id,
        source_presence_end_id: presenceSegment.source_presence_end_id,
      });
    }

    if (windowSegment.end_time_ms <= presenceSegment.end_time_ms) {
      windowIndex += 1;
    } else {
      presenceIndex += 1;
    }
  }

  return sessions;
}

function buildPowerAvailabilitySegments(
  powerEvents: RawPowerEventRecord[],
  nowMs: number,
): PowerAvailabilitySegment[] {
  const sorted = [...powerEvents].sort((a, b) => a.timestamp_ms - b.timestamp_ms || a.id - b.id);
  const segments: PowerAvailabilitySegment[] = [];
  let available = true;
  let segmentStart = 0;

  for (const event of sorted) {
    const isHardBoundary =
      event.state === "lock" ||
      event.state === "suspend" ||
      event.state === "shutdown";
    const restoresAvailability =
      event.state === "startup" ||
      event.state === "unlock" ||
      event.state === "resume";

    if (available && isHardBoundary) {
      segments.push({
        start_time_ms: segmentStart,
        end_time_ms: event.timestamp_ms,
        cut_reason: event.state,
      });
      available = false;
      continue;
    }

    if (!available && restoresAvailability) {
      segmentStart = event.timestamp_ms;
      available = true;
    }
  }

  if (available) {
    segments.push({
      start_time_ms: segmentStart,
      end_time_ms: nowMs,
      cut_reason: "timeline_end",
    });
  }

  return segments;
}

function intersectWithPowerAvailability(
  sessions: CandidateSession[],
  powerSegments: PowerAvailabilitySegment[],
): CandidateSession[] {
  const result: CandidateSession[] = [];
  let sessionIndex = 0;
  let powerIndex = 0;

  while (sessionIndex < sessions.length && powerIndex < powerSegments.length) {
    const session = sessions[sessionIndex];
    const powerSegment = powerSegments[powerIndex];

    const overlapStart = Math.max(session.start_time_ms, powerSegment.start_time_ms);
    const overlapEnd = Math.min(session.end_time_ms, powerSegment.end_time_ms);

    if (overlapStart < overlapEnd) {
      const cut_reason =
        session.end_time_ms < powerSegment.end_time_ms
          ? session.cut_reason
          : powerSegment.end_time_ms < session.end_time_ms
            ? powerSegment.cut_reason
            : powerSegment.cut_reason !== "timeline_end"
              ? powerSegment.cut_reason
              : session.cut_reason;

      result.push({
        ...session,
        start_time_ms: overlapStart,
        end_time_ms: overlapEnd,
        cut_reason,
      });
    }

    if (session.end_time_ms <= powerSegment.end_time_ms) {
      sessionIndex += 1;
    } else {
      powerIndex += 1;
    }
  }

  return result;
}

function finalizeSessions(
  sessions: CandidateSession[],
  minSessionSecs: number,
): DerivedSessionRecord[] {
  const minDurationMs = Math.max(0, minSessionSecs) * 1000;

  return sessions
    .map((session) => {
      const end_time_ms = Math.max(session.start_time_ms, session.end_time_ms);
      const duration_ms = end_time_ms - session.start_time_ms;

      return {
        ...session,
        end_time_ms,
        duration_ms,
      };
    })
    .filter((session) => session.duration_ms >= minDurationMs);
}

export function compileDerivedSessions(args: {
  rawWindowEvents: RawWindowEventRecord[];
  rawPresenceEvents: RawPresenceEventRecord[];
  rawPowerEvents: RawPowerEventRecord[];
  nowMs: number;
  minSessionSecs: number;
  shouldTrack: (exeName: string) => boolean;
}): DerivedSessionRecord[] {
  const {
    rawWindowEvents,
    rawPresenceEvents,
    rawPowerEvents,
    nowMs,
    minSessionSecs,
    shouldTrack,
  } = args;

  const windowSegments = buildWindowSegments(rawWindowEvents, nowMs);
  const presenceSegments = buildPresenceSegments(rawPresenceEvents, nowMs);
  const powerSegments = buildPowerAvailabilitySegments(rawPowerEvents, nowMs);
  const candidates = intersectTrackableWindowsWithPresence(
    windowSegments,
    presenceSegments,
    shouldTrack,
  );
  const gatedByPower = intersectWithPowerAvailability(candidates, powerSegments);

  return finalizeSessions(gatedByPower, minSessionSecs);
}
