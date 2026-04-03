import assert from "node:assert/strict";
import {
  isTrackableWindow,
  planSessionFinalization,
  planWindowTransition,
  type ActiveSessionSnapshot,
  type TrackedWindow,
} from "../src/lib/services/trackingLifecycle.ts";
import { buildNormalizedAppStats, mergeSessionsForTimeline } from "../src/lib/services/history.ts";
import type { HistorySession } from "../src/lib/db.ts";

const shouldTrack = (exeName: string) => !["explorer.exe", "time_tracker.exe"].includes(exeName.toLowerCase());

function makeWindow(overrides: Partial<TrackedWindow> = {}): TrackedWindow {
  return {
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
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
    nextWindow: makeWindow({ exe_name: "explorer.exe", title: "Explorer", process_path: "C:\\Windows\\explorer.exe", is_afk: true }),
    settings: { afk_timeout_secs: 300, min_session_secs: 5 },
    nowMs,
    shouldTrack,
  });

  assert.equal(result.shouldEndPrevious, true);
  assert.equal(result.shouldStartNext, false);
  assert.equal(result.endTimeOverride, nowMs - 300_000);
});

runTest("session finalization only deletes short sessions that were active in this close operation", () => {
  const activeSessions: ActiveSessionSnapshot[] = [
    { id: 11, start_time: 1_000 },
    { id: 12, start_time: 9_000 },
  ];

  const result = planSessionFinalization(activeSessions, 12_000, 5);

  assert.deepEqual(result.idsToDelete, [12]);
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
