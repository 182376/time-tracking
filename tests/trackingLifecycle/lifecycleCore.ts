import {
  assert,
  isTrackableWindow,
  makeWindow,
  planWindowTransition,
  resolveStartupSealTime,
  runTest,
  shouldTrack,
} from "./shared.ts";

export function runLifecycleCoreTests() {
  runTest("repeated same window does not trigger session changes", () => {
    const currentWindow = makeWindow();
    const result = planWindowTransition({
      previousWindow: currentWindow,
      nextWindow: currentWindow,
      nowMs: 1_000_000,
      shouldTrack,
    });

    assert.deepEqual(result, {
      didChange: false,
      reason: "session-no-change",
      shouldEndPrevious: false,
      shouldStartNext: false,
      shouldRefreshMetadata: false,
      endTimeOverride: undefined,
    });
  });

  runTest("title changes inside the same executable do not trigger session changes", () => {
    const result = planWindowTransition({
      previousWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat A" }),
      nextWindow: makeWindow({ exe_name: "QQ.exe", title: "Chat B" }),
      nowMs: 1_000_000,
      shouldTrack,
    });

    assert.deepEqual(result, {
      didChange: false,
      reason: "session-metadata-refreshed",
      shouldEndPrevious: false,
      shouldStartNext: false,
      shouldRefreshMetadata: true,
      endTimeOverride: undefined,
    });
  });

  runTest("switching between tracked windows ends previous session and starts next", () => {
    const result = planWindowTransition({
      previousWindow: makeWindow({ exe_name: "QQ.exe", title: "QQ Chat" }),
      nextWindow: makeWindow({ exe_name: "Antigravity.exe", title: "Editor", process_path: "C:\\Apps\\Antigravity.exe" }),
      nowMs: 1_000_000,
      shouldTrack,
    });

    assert.equal(result.didChange, true);
    assert.equal(result.reason, "session-transition-app-change");
    assert.equal(result.shouldEndPrevious, true);
    assert.equal(result.shouldStartNext, true);
    assert.equal(result.shouldRefreshMetadata, false);
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
      nowMs,
      shouldTrack,
    });

    assert.equal(result.shouldEndPrevious, true);
    assert.equal(result.shouldStartNext, false);
    assert.equal(result.shouldRefreshMetadata, false);
    assert.equal(result.endTimeOverride, nowMs - 300_000);
  });

  runTest("same app different top-level window keeps one session but refreshes metadata", () => {
    const result = planWindowTransition({
      previousWindow: makeWindow({
        hwnd: "0x100",
        root_owner_hwnd: "0x100",
        title: "Chat A",
      }),
      nextWindow: makeWindow({
        hwnd: "0x200",
        root_owner_hwnd: "0x200",
        title: "Chat B",
      }),
      nowMs: 1_000_000,
      shouldTrack,
    });

    assert.equal(result.didChange, false);
    assert.equal(result.reason, "session-metadata-refreshed");
    assert.equal(result.shouldEndPrevious, false);
    assert.equal(result.shouldStartNext, false);
    assert.equal(result.shouldRefreshMetadata, true);
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
}
