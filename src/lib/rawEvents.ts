import type { TrackedWindow } from "./services/trackingLifecycle";

export const TRACKER_POLL_SOURCE = "tracker_poll_v1" as const;

export type RawEventSource = typeof TRACKER_POLL_SOURCE | "power_lifecycle_v1";
export type RawPresenceState = "active" | "idle";
export type RawPowerState =
  | "startup"
  | "shutdown"
  | "lock"
  | "unlock"
  | "suspend"
  | "resume";

export interface RawEventBase {
  timestamp_ms: number;
  source: RawEventSource;
}

export interface RawWindowEvent extends RawEventBase {
  exe_name: string;
  window_title: string;
  process_path: string;
}

export interface RawPresenceEvent extends RawEventBase {
  state: RawPresenceState;
  idle_time_ms: number;
}

export interface RawPowerEvent extends RawEventBase {
  state: RawPowerState;
}

export type RawEventQueueKind = "window" | "presence" | "power";

export interface RawEventQueueEntry {
  event_kind: RawEventQueueKind;
  timestamp_ms: number;
  source: RawEventSource;
  dedupe_key: string;
  payload_json: string;
}

export function buildRawTrackingEvents(
  win: TrackedWindow,
  timestampMs: number,
  source: RawEventSource = TRACKER_POLL_SOURCE,
) {
  const windowEvent: RawWindowEvent = {
    timestamp_ms: timestampMs,
    exe_name: win.exe_name,
    window_title: win.title,
    process_path: win.process_path,
    source,
  };

  const presenceEvent: RawPresenceEvent = {
    timestamp_ms: timestampMs,
    state: win.is_afk ? "idle" : "active",
    idle_time_ms: win.idle_time_ms,
    source,
  };

  return {
    windowEvent,
    presenceEvent,
  };
}

function buildRawEventDedupeKey(
  eventKind: RawEventQueueKind,
  event: RawWindowEvent | RawPresenceEvent | RawPowerEvent,
) {
  return JSON.stringify({
    event_kind: eventKind,
    ...event,
  });
}

function buildRawEventQueueEntry(
  eventKind: RawEventQueueKind,
  event: RawWindowEvent | RawPresenceEvent | RawPowerEvent,
): RawEventQueueEntry {
  return {
    event_kind: eventKind,
    timestamp_ms: event.timestamp_ms,
    source: event.source,
    dedupe_key: buildRawEventDedupeKey(eventKind, event),
    payload_json: JSON.stringify(event),
  };
}

export function buildRawTrackingQueueEntries(
  win: TrackedWindow,
  timestampMs: number,
  source: RawEventSource = TRACKER_POLL_SOURCE,
) {
  const { windowEvent, presenceEvent } = buildRawTrackingEvents(win, timestampMs, source);

  return [
    buildRawEventQueueEntry("window", windowEvent),
    buildRawEventQueueEntry("presence", presenceEvent),
  ];
}

export function buildRawPowerQueueEntry(event: RawPowerEvent) {
  return buildRawEventQueueEntry("power", event);
}

export function planRawEventQueueReplay(
  queuedEntries: RawEventQueueEntry[],
  existingDedupeKeys: Iterable<string>,
) {
  const seen = new Set(existingDedupeKeys);
  const entriesToInsert: RawEventQueueEntry[] = [];
  const acknowledgedKeys: string[] = [];

  for (const entry of queuedEntries) {
    if (!seen.has(entry.dedupe_key)) {
      entriesToInsert.push(entry);
      seen.add(entry.dedupe_key);
    }
    acknowledgedKeys.push(entry.dedupe_key);
  }

  return {
    entriesToInsert,
    acknowledgedKeys,
  };
}
