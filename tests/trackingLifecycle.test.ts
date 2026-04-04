import assert from "node:assert/strict";
import {
  isTrackableWindow,
  planWindowTransition,
  resolveStartupSealTime,
  type TrackedWindow,
} from "../src/lib/services/trackingLifecycle.ts";
import {
  buildDailySummaries,
  buildNormalizedAppStats,
  buildTimelineSessions,
  compileSessions,
  getDayRange,
  getRollingDayRanges,
} from "../src/lib/services/sessionCompiler.ts";
import type { HistorySession } from "../src/lib/db.ts";

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

runTest("title changes inside the same executable do not trigger session changes", () => {
  const result = planWindowTransition({
    previousWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat A" }),
    nextWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat B" }),
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

runTest("startup sealing prefers the last stored heartbeat over current startup time", () => {
  const endTime = resolveStartupSealTime({
    sessionStartTime: 1_000,
    lastHeartbeatMs: 8_000,
    nowMs: 20_000,
  });

  assert.equal(endTime, 8_000);
});

runTest("startup sealing clamps invalid heartbeat values to the current startup boundary", () => {
  const futureHeartbeat = resolveStartupSealTime({
    sessionStartTime: 1_000,
    lastHeartbeatMs: 30_000,
    nowMs: 20_000,
  });
  const missingHeartbeat = resolveStartupSealTime({
    sessionStartTime: 5_000,
    lastHeartbeatMs: null,
    nowMs: 20_000,
  });

  assert.equal(futureHeartbeat, 20_000);
  assert.equal(missingHeartbeat, 20_000);
});

runTest("normalized app stats keep different executables separate even if display names match", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", duration: 120_000, end_time: 121_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 200_000, end_time: 320_000, duration: 120_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 400_000,
    minSessionSecs: 30,
  });

  const stats = buildNormalizedAppStats(compiled);

  assert.equal(stats.length, 2);
  assert.deepEqual(
    stats.map((item) => item.exe_name).sort(),
    ["QQ.exe", "QQNT.exe"].sort(),
  );
});

runTest("short same-app fragments survive when filtering happens after merge", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 20_000, duration: 20_000 }),
    makeSession({ id: 2, exe_name: "QQ.exe", start_time: 22_000, end_time: 42_000, duration: 20_000, window_title: "QQ Other" }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 100_000,
    minSessionSecs: 30,
  });

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].duration, 42_000);
});

runTest("timeline merge does not merge different executables with the same mapped display name", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", app_name: "QQ", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "QQNT.exe", app_name: "QQ", start_time: 62_000, end_time: 122_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 200_000,
    minSessionSecs: 30,
  });
  const timeline = buildTimelineSessions(compiled, 180);

  assert.equal(timeline.length, 2);
  assert.deepEqual(
    timeline.map((item) => item.exe_name),
    ["QQ.exe", "QQNT.exe"],
  );
});

runTest("timeline grouping preserves active duration while extending the visible span", () => {
  const sessions: HistorySession[] = [
    makeSession({ id: 1, exe_name: "QQ.exe", start_time: 0, end_time: 60_000, duration: 60_000 }),
    makeSession({ id: 2, exe_name: "Chrome.exe", app_name: "Chrome", start_time: 60_000, end_time: 90_000, duration: 30_000 }),
    makeSession({ id: 3, exe_name: "QQ.exe", start_time: 90_000, end_time: 150_000, duration: 60_000 }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: 0,
    endMs: 200_000,
    minSessionSecs: 30,
  });
  const timeline = buildTimelineSessions(compiled, 180);

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].start_time, 0);
  assert.equal(timeline[0].end_time, 150_000);
  assert.equal(timeline[0].duration, 120_000);
});

runTest("day compilation clips cross-day sessions to the selected date", () => {
  const day = new Date(2026, 3, 4, 12, 0, 0, 0);
  const range = getDayRange(day, new Date(2026, 3, 5, 0, 0, 0, 0).getTime());
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      start_time: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
      end_time: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
      duration: 30 * 60_000,
    }),
  ];
  const compiled = compileSessions(sessions, {
    startMs: range.startMs,
    endMs: range.endMs,
    minSessionSecs: 30,
  });

  assert.equal(compiled.length, 1);
  assert.equal(compiled[0].duration, 20 * 60_000);
});

runTest("daily summaries attribute cross-day activity to both days", () => {
  const nowMs = new Date(2026, 3, 4, 12, 0, 0, 0).getTime();
  const ranges = getRollingDayRanges(2, nowMs);
  const sessions: HistorySession[] = [
    makeSession({
      id: 1,
      start_time: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
      end_time: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
      duration: 30 * 60_000,
    }),
  ];
  const summaries = buildDailySummaries(sessions, ranges, 30);

  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].total_duration, 10 * 60_000);
  assert.equal(summaries[1].total_duration, 20 * 60_000);
});

console.log(`Passed ${passed} tracking lifecycle tests`);
