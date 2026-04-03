import assert from "node:assert/strict";
import {
  isTrackableWindow,
  planPowerTransition,
  planSessionFinalization,
  planWindowTransition,
  type ActiveSessionSnapshot,
  type TrackedWindow,
} from "../src/lib/services/trackingLifecycle.ts";
import {
  buildRawPowerQueueEntry,
  buildRawTrackingEvents,
  buildRawTrackingQueueEntries,
  planRawEventQueueReplay,
  TRACKER_POLL_SOURCE,
} from "../src/lib/rawEvents.ts";
import { compileDerivedSessions } from "../src/lib/services/sessionCompiler.ts";
import { compareDaySessions } from "../src/lib/services/sessionDiff.ts";
import { buildNormalizedAppStats, mergeSessionsForTimeline } from "../src/lib/services/history.ts";
import type { HistorySession, StoredDerivedSession } from "../src/lib/db.ts";

const shouldTrack = (exeName: string) => !["explorer.exe", "time_tracker.exe"].includes(exeName.toLowerCase());

function makeWindow(overrides: Partial<TrackedWindow> = {}): TrackedWindow {
  return {
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
    idle_time_ms: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<HistorySession> = {}): HistorySession {
  return {
    id: 1,
    app_name: "QQ",
    exe_name: "QQ.exe",
    window_title: "QQ Chat",
    start_time: 1_000,
    end_time: 11_000,
    duration: 10_000,
    ...overrides,
  };
}

function makeDerivedSession(overrides: Partial<StoredDerivedSession> = {}): StoredDerivedSession {
  return {
    id: 1,
    start_time_ms: 1_000,
    end_time_ms: 11_000,
    duration_ms: 10_000,
    exe_name: "QQ.exe",
    window_title: "QQ Chat",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    cut_reason: "window_change",
    source_window_start_id: 1,
    source_window_end_id: 2,
    source_presence_start_id: 11,
    source_presence_end_id: 12,
    ...overrides,
  };
}

let passed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("repeated same window does not trigger session changes", () => {
  const currentWindow = makeWindow();
  const result = planWindowTransition({
    previousWindow: currentWindow,
    nextWindow: currentWindow,
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.deepEqual(result, {
    didChange: false,
    shouldEndPrevious: false,
    shouldStartNext: false,
    endTimeOverride: undefined,
  });
});

runTest("switching between tracked windows ends previous session and starts next", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "QQ.exe", title: "QQ Chat" }),
    nextWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Editor", process_path: "C:\\Apps\\Antigravity.exe" }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.equal(result.didChange, true);
  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, true);
  assert.equal(result.endTimeOverride, undefined);
});

runTest("changing only the title of a tracked window still creates a new session boundary", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat A" }),
    nextWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat B" }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.equal(result.didChange, true);
  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, true);
  assert.equal(result.endTimeOverride, undefined);
});

runTest("windows with a known executable but no process path are still trackable", () => {
  const chromeWindow = makeWindow({
    exe_name: "chrome.exe",
    process_path: "",
    title: "Google Chrome",
  });

  assert.equal(isTrackableWindow(chromeWindow, shouldTrack), true);
});

runTest("afk transition backdates end time and does not start a new session", () => {
  const nowMs = 1_000_000;
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Coding" }),
    nextWindow: makeWindow({
      exe_name: "explorer.exe",
      title: "Explorer",
      process_path: "C:\\Windows\\explorer.exe",
      is_afk: true,
      idle_time_ms: 300_000,
    }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs,
    shouldTrack,
  });

  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, false);
  assert.equal(result.endTimeOverride, nowMs - 300_000);
});

runTest("switching from a tracked window to an untracked non-afk window ends the session without backdating", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Coding" }),
    nextWindow: makeWindow({
      exe_name: "explorer.exe",
      title: "Explorer",
      process_path: "C:\\Windows\\explorer.exe",
      is_afk: false,
      idle_time_ms: 0,
    }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.equal(result.didChange, true);
  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, false);
  assert.equal(result.endTimeOverride, undefined);
});

runTest("afk polling with no previous tracked window does not fabricate a session transition", () => {
  const result = planWindowTransition({
    previousWindow: null,
    nextWindow: makeWindow({
      exe_name: "",
      title: "",
      process_path: "",
      is_afk: true,
      idle_time_ms: 600_000,
    }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs: 1_000_000,
    shouldTrack,
  });

  assert.deepEqual(result, {
    didChange: true,
    shouldEndPrevious: false,
    shouldStartNext: false,
    endTimeOverride: undefined,
  });
});

runTest("raw tracking events keep the same timestamp and source for window and presence snapshots", () => {
  const win = makeWindow({
    exe_name: "Antigravity.exe",
    title: "Editor",
    process_path: "C:\\Apps\\Antigravity.exe",
    is_afk: false,
    idle_time_ms: 1_500,
  });

  const { windowEvent, presenceEvent } = buildRawTrackingEvents(win, 123_456);

  assert.deepEqual(windowEvent, {
    timestamp_ms: 123_456,
    exe_name: "Antigravity.exe",
    window_title: "Editor",
    process_path: "C:\\Apps\\Antigravity.exe",
    source: TRACKER_POLL_SOURCE,
  });
  assert.deepEqual(presenceEvent, {
    timestamp_ms: 123_456,
    state: "active",
    idle_time_ms: 1_500,
    source: TRACKER_POLL_SOURCE,
  });
});

runTest("raw tracking events map afk snapshots to idle presence records", () => {
  const { presenceEvent } = buildRawTrackingEvents(
    makeWindow({
      exe_name: "",
      title: "",
      process_path: "",
      is_afk: true,
      idle_time_ms: 600_000,
    }),
    321_000,
  );

  assert.deepEqual(presenceEvent, {
    timestamp_ms: 321_000,
    state: "idle",
    idle_time_ms: 600_000,
    source: TRACKER_POLL_SOURCE,
  });
});

runTest("queue entries are generated for both window and presence snapshots before flush", () => {
  const entries = buildRawTrackingQueueEntries(
    makeWindow({
      exe_name: "Antigravity.exe",
      title: "Editor",
      process_path: "C:\\Apps\\Antigravity.exe",
      is_afk: false,
      idle_time_ms: 2_000,
    }),
    200_000,
  );

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.event_kind),
    ["window", "presence"],
  );
  assert.equal(new Set(entries.map((entry) => entry.dedupe_key)).size, 2);
});

runTest("queue replay inserts queued events on restart after a crash-before-flush scenario", () => {
  const queuedEntries = buildRawTrackingQueueEntries(
    makeWindow({
      exe_name: "Antigravity.exe",
      title: "Editor",
      process_path: "C:\\Apps\\Antigravity.exe",
      is_afk: false,
      idle_time_ms: 2_000,
    }),
    250_000,
  );

  const replayPlan = planRawEventQueueReplay(queuedEntries, []);

  assert.equal(replayPlan.entriesToInsert.length, 2);
  assert.deepEqual(
    replayPlan.acknowledgedKeys.sort(),
    queuedEntries.map((entry) => entry.dedupe_key).sort(),
  );
});

runTest("queue replay does not duplicate events that were already flushed before restart", () => {
  const queuedEntries = buildRawTrackingQueueEntries(
    makeWindow({
      exe_name: "Antigravity.exe",
      title: "Editor",
      process_path: "C:\\Apps\\Antigravity.exe",
      is_afk: false,
      idle_time_ms: 2_000,
    }),
    260_000,
  );
  const powerEntry = buildRawPowerQueueEntry({
    timestamp_ms: 261_000,
    state: "resume",
    source: "power_lifecycle_v1",
  });

  const replayPlan = planRawEventQueueReplay(
    [...queuedEntries, powerEntry],
    queuedEntries.map((entry) => entry.dedupe_key),
  );

  assert.deepEqual(
    replayPlan.entriesToInsert.map((entry) => entry.event_kind),
    ["power"],
  );
  assert.deepEqual(
    replayPlan.acknowledgedKeys.sort(),
    [...queuedEntries, powerEntry].map((entry) => entry.dedupe_key).sort(),
  );
});

runTest("power boundaries end active sessions for lock suspend and shutdown", () => {
  for (const state of ["lock", "suspend", "shutdown"] as const) {
    const result = planPowerTransition({
      state,
      timestampMs: 500_000,
    });

    assert.deepEqual(result, {
      shouldEndActiveSession: true,
      endTimeOverride: 500_000,
      shouldResetWindowState: true,
    });
  }
});

runTest("power non-boundaries do not end active sessions for startup unlock and resume", () => {
  for (const state of ["startup", "unlock", "resume"] as const) {
    const result = planPowerTransition({
      state,
      timestampMs: 500_000,
    });

    assert.deepEqual(result, {
      shouldEndActiveSession: false,
      endTimeOverride: undefined,
      shouldResetWindowState: false,
    });
  }
});

runTest("compiler merges repeated heartbeats into one canonical session and stores the boundary reason", () => {
  const sessions = compileDerivedSessions({
    rawWindowEvents: [
      { id: 1, timestamp_ms: 0, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 2, timestamp_ms: 2_000, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 3, timestamp_ms: 4_000, exe_name: "explorer.exe", window_title: "Explorer", process_path: "C:\\Windows\\explorer.exe", source: TRACKER_POLL_SOURCE },
    ],
    rawPresenceEvents: [
      { id: 11, timestamp_ms: 0, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 12, timestamp_ms: 2_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 13, timestamp_ms: 4_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
    ],
    rawPowerEvents: [],
    nowMs: 6_000,
    minSessionSecs: 0,
    shouldTrack,
  });

  assert.deepEqual(sessions, [
    {
      start_time_ms: 0,
      end_time_ms: 4_000,
      duration_ms: 4_000,
      exe_name: "Antigravity.exe",
      window_title: "Editor",
      process_path: "C:\\Apps\\Antigravity.exe",
      cut_reason: "window_change",
      source_window_start_id: 1,
      source_window_end_id: 2,
      source_presence_start_id: 11,
      source_presence_end_id: 13,
    },
  ]);
});

runTest("compiler removes suspended time until resume instead of only splitting at suspend", () => {
  const sessions = compileDerivedSessions({
    rawWindowEvents: [
      { id: 1, timestamp_ms: 0, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 2, timestamp_ms: 2_000, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 3, timestamp_ms: 6_000, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 4, timestamp_ms: 8_000, exe_name: "explorer.exe", window_title: "Explorer", process_path: "C:\\Windows\\explorer.exe", source: TRACKER_POLL_SOURCE },
    ],
    rawPresenceEvents: [
      { id: 11, timestamp_ms: 0, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 12, timestamp_ms: 2_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 13, timestamp_ms: 6_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 14, timestamp_ms: 8_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
    ],
    rawPowerEvents: [
      { id: 21, timestamp_ms: 3_000, state: "suspend", source: "power_lifecycle_v1" },
      { id: 22, timestamp_ms: 5_000, state: "resume", source: "power_lifecycle_v1" },
    ],
    nowMs: 10_000,
    minSessionSecs: 0,
    shouldTrack,
  });

  assert.deepEqual(
    sessions.map((session) => ({
      start_time_ms: session.start_time_ms,
      end_time_ms: session.end_time_ms,
      duration_ms: session.duration_ms,
      cut_reason: session.cut_reason,
    })),
    [
      {
        start_time_ms: 0,
        end_time_ms: 3_000,
        duration_ms: 3_000,
        cut_reason: "suspend",
      },
      {
        start_time_ms: 5_000,
        end_time_ms: 8_000,
        duration_ms: 3_000,
        cut_reason: "window_change",
      },
    ],
  );
});

runTest("compiler applies minimum session filtering after derivation", () => {
  const sessions = compileDerivedSessions({
    rawWindowEvents: [
      { id: 1, timestamp_ms: 0, exe_name: "Antigravity.exe", window_title: "Editor", process_path: "C:\\Apps\\Antigravity.exe", source: TRACKER_POLL_SOURCE },
      { id: 2, timestamp_ms: 3_000, exe_name: "explorer.exe", window_title: "Explorer", process_path: "C:\\Windows\\explorer.exe", source: TRACKER_POLL_SOURCE },
    ],
    rawPresenceEvents: [
      { id: 11, timestamp_ms: 0, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
      { id: 12, timestamp_ms: 3_000, state: "active", idle_time_ms: 0, source: TRACKER_POLL_SOURCE },
    ],
    rawPowerEvents: [],
    nowMs: 5_000,
    minSessionSecs: 5,
    shouldTrack,
  });

  assert.deepEqual(sessions, []);
});

runTest("session finalization only deletes short sessions that were active in this close operation", () => {
  const activeSessions: ActiveSessionSnapshot[] = [
    { id: 11, start_time: 1_000 },
    { id: 12, start_time: 9_000 },
  ];

  const result = planSessionFinalization(activeSessions, 12_000, 5);

  assert.deepEqual(result.idsToDelete, [12]);
});

runTest("session finalization treats end times before start as zero-duration cleanup candidates", () => {
  const activeSessions: ActiveSessionSnapshot[] = [
    { id: 21, start_time: 20_000 },
    { id: 22, start_time: 40_000 },
  ];

  const result = planSessionFinalization(activeSessions, 12_000, 5);

  assert.deepEqual(result.idsToDelete, [21, 22]);
});

runTest("normalized app stats keep different executables separate even if display names match", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", duration: 120_000, end_time: 121_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 200_000, end_time: 320_000, duration: 120_000 }),
  ];

  const stats = buildNormalizedAppStats(sessions);

  assert.equal(stats.length, 2);
  assert.deepEqual(
    stats.map((item) => item.exe_name).sort(),
    ["QQ.exe", "QQNT.exe"].sort(),
  );
});

runTest("timeline merge does not merge different executables with the same mapped display name", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 62_000, end_time: 122_000, duration: 60_000 }),
  ];

  const timeline = mergeSessionsForTimeline(sessions, 180);

  assert.equal(timeline.length, 2);
  assert.deepEqual(
    timeline.map((item) => item.exe_name),
    ["QQ.exe", "QQNT.exe"],
  );
});

console.log(`Passed ${passed} tracking lifecycle tests`);
