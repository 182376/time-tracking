import {
  applyTrackingDataChangedPayload,
  assert,
  buildSessionCleanupPlan,
  clearSessionsByRangeWithDeps,
  buildReadModelDiagnostics,
  compileSessions,
  isTrackingDataChangedPayload,
  isTrackingWindowSnapshot,
  makeSession,
  materializeLiveSessions,
  resolveLiveCutoffMs,
  resolveSessionStartCleanupCutoffTime,
  resolveTrackerHealth,
  resolveTrackingDataChangedEffects,
  runTest,
  shouldDeleteSessionByStartTime,
  shouldSyncTrackingPause,
} from "./shared.ts";
import {
  buildHistoryView,
  buildDashboardView,
  makeStaleTrackerHealth,
} from "../helpers/trackingReadModelFixtures.ts";

export function runRuntimeEffectsTests() {
  runTest("tracking runtime payload guards accept expected contracts", () => {
    assert.equal(isTrackingWindowSnapshot({
      hwnd: "0x100",
      root_owner_hwnd: "0x100",
      process_id: 123,
      window_class: "Chrome_WidgetWin_1",
      title: "Window",
      exe_name: "QQ.exe",
      process_path: "C:\\Program Files\\QQ\\QQ.exe",
      is_afk: false,
      idle_time_ms: 0,
    }), true);
    assert.equal(isTrackingWindowSnapshot({
      hwnd: "0x100",
      root_owner_hwnd: "0x100",
      process_id: 123,
      window_class: "Chrome_WidgetWin_1",
      title: "Window",
      exe_name: "QQ.exe",
      process_path: "C:\\Program Files\\QQ\\QQ.exe",
      is_afk: "false",
      idle_time_ms: 0,
    }), false);
    assert.equal(isTrackingWindowSnapshot({
      root_owner_hwnd: "0x100",
      process_id: 123,
      window_class: "Chrome_WidgetWin_1",
      title: "Window",
      exe_name: "QQ.exe",
      process_path: "C:\\Program Files\\QQ\\QQ.exe",
      is_afk: false,
      idle_time_ms: 0,
    }), false);

    assert.equal(isTrackingDataChangedPayload({
      reason: "session-transition",
      changed_at_ms: 123,
    }), true);
    assert.equal(isTrackingDataChangedPayload({
      reason: "session-transition",
      changed_at_ms: "123",
    }), false);
  });

  runTest("tracking pause sync reasons only accept explicit pause toggle events", () => {
    assert.equal(shouldSyncTrackingPause("tracking-paused"), true);
    assert.equal(shouldSyncTrackingPause("tracking-resumed"), true);
  });

  runTest("tracking pause sync reasons reject non-toggle tracking data changes", () => {
    const nonToggleReasons = [
      "tracking-paused-sealed",
      "watchdog-sealed",
      "startup-sealed",
      "backup-restored",
      "session-transition",
    ];

    for (const reason of nonToggleReasons) {
      assert.equal(shouldSyncTrackingPause(reason), false);
    }
  });

  runTest("tracking data changed sealed reasons force refresh without pause setting sync", () => {
    const sealedReasons = [
      "watchdog-sealed",
      "startup-sealed",
      "tracking-paused-sealed",
    ];

    for (const reason of sealedReasons) {
      const effects = resolveTrackingDataChangedEffects(reason);
      assert.equal(effects.shouldRefresh, true);
      assert.equal(effects.shouldSyncPauseSetting, false);
    }
  });

  runTest("tracking pause toggle reasons force refresh and sync pause setting", () => {
    for (const reason of ["tracking-paused", "tracking-resumed"]) {
      const effects = resolveTrackingDataChangedEffects(reason);
      assert.equal(effects.shouldRefresh, true);
      assert.equal(effects.shouldSyncPauseSetting, true);
    }
  });

  runTest("backup restored event keeps refresh=true and pause sync=false", () => {
    const effects = resolveTrackingDataChangedEffects("backup-restored");
    assert.equal(effects.shouldRefresh, true);
    assert.equal(effects.shouldSyncPauseSetting, false);
  });

  runTest("power lifecycle end reasons keep refresh=true and pause sync=false", () => {
    for (const reason of ["session-ended-lock", "session-ended-suspend"]) {
      const effects = resolveTrackingDataChangedEffects(reason);
      assert.equal(effects.shouldRefresh, true);
      assert.equal(effects.shouldSyncPauseSetting, false);
    }
  });

  runTest("tracking data changed runtime syncs pause setting and refreshes on pause toggle", async () => {
    let syncTickCount = 0;
    let trackedPausedValue: boolean | null = null;
    let loadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "tracking-paused",
      changed_at_ms: 123,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        loadCalls += 1;
        return true;
      },
      setAppSettings: (updater) => {
        trackedPausedValue = updater({
          refresh_interval_secs: 5,
          min_session_secs: 30,
          timeline_merge_gap_secs: 180,
          tracking_paused: false,
        }).tracking_paused;
      },
      bumpSyncTick: () => {
        syncTickCount += 1;
      },
      warn: () => {
        throw new Error("pause toggle sync should not warn");
      },
    });

    assert.equal(loadCalls, 1);
    assert.equal(trackedPausedValue, true);
    assert.equal(syncTickCount, 1);
  });

  runTest("tracking data changed runtime refreshes without pause sync for sealed reasons", async () => {
    let syncTickCount = 0;
    let loadCalls = 0;
    let setCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "tracking-paused-sealed",
      changed_at_ms: 456,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        loadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        setCalls += 1;
      },
      bumpSyncTick: () => {
        syncTickCount += 1;
      },
      warn: () => {
        throw new Error("sealed refresh should not warn");
      },
    });

    assert.equal(loadCalls, 0);
    assert.equal(setCalls, 0);
    assert.equal(syncTickCount, 1);
  });

  runTest("tracking data changed runtime warns but still refreshes when pause sync fails", async () => {
    let syncTickCount = 0;
    let warned = false;

    await applyTrackingDataChangedPayload({
      reason: "tracking-resumed",
      changed_at_ms: 789,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        throw new Error("boom");
      },
      setAppSettings: () => {
        throw new Error("failed sync should not set app settings");
      },
      bumpSyncTick: () => {
        syncTickCount += 1;
      },
      warn: (message, error) => {
        warned = true;
        assert.equal(message, "Failed to sync tracking pause setting");
        assert.equal(error instanceof Error, true);
      },
    });

    assert.equal(warned, true);
    assert.equal(syncTickCount, 1);
  });

  runTest("cleanup uses session start time cutoff and deletes active sessions started before cutoff", () => {
    const nowMs = new Date(2026, 3, 17, 12, 0, 0, 0).getTime();
    const cutoffTime = resolveSessionStartCleanupCutoffTime(7, nowMs);
    const activeBeforeCutoff = makeSession({
      id: 1001,
      exe_name: "QQ.exe",
      start_time: cutoffTime - 1,
      end_time: null,
      duration: null,
    });
    const activeAtCutoff = makeSession({
      id: 1002,
      exe_name: "Chrome.exe",
      app_name: "Chrome",
      start_time: cutoffTime,
      end_time: null,
      duration: null,
    });

    assert.equal(shouldDeleteSessionByStartTime(activeBeforeCutoff.start_time, cutoffTime), true);
    assert.equal(shouldDeleteSessionByStartTime(activeAtCutoff.start_time, cutoffTime), false);
  });

  runTest("cleanup plan makes the current boundary explicit", () => {
    const nowMs = new Date(2026, 3, 17, 12, 0, 0, 0).getTime();
    const cleanupPlan = buildSessionCleanupPlan(7, nowMs);

    assert.equal(cleanupPlan.range, 7);
    assert.equal(cleanupPlan.nowMs, nowMs);
    assert.equal(cleanupPlan.cutoffTime, resolveSessionStartCleanupCutoffTime(7, nowMs));
    assert.equal(cleanupPlan.mode, "session-start-before-cutoff");
    assert.equal(cleanupPlan.deletesSessionsStartingBeforeCutoff, true);
    assert.equal(cleanupPlan.keepsSessionsStartingAtOrAfterCutoff, true);
    assert.equal(cleanupPlan.deletesCrossCutoffActiveSessionsByStartTime, true);
  });

  runTest("cleanup execution uses the explicit cleanup plan cutoff", async () => {
    const nowMs = new Date(2026, 3, 17, 12, 0, 0, 0).getTime();
    const expectedPlan = buildSessionCleanupPlan(30, nowMs);
    let deletedCutoffTime: number | null = null;

    await clearSessionsByRangeWithDeps(30, nowMs, {
      clearSessionsBefore: async (cutoffTime) => {
        deletedCutoffTime = cutoffTime;
      },
    });

    assert.equal(deletedCutoffTime, expectedPlan.cutoffTime);
  });

  runTest("cleanup deletion removes old active sessions from live read model", () => {
    const nowMs = 100_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const cutoffTime = 50_000;
    const sessions = [
      makeSession({
        id: 2001,
        exe_name: "old-active.exe",
        app_name: "Old Active",
        start_time: 40_000,
        end_time: null,
        duration: null,
      }),
      makeSession({
        id: 2002,
        exe_name: "new-active.exe",
        app_name: "New Active",
        start_time: 80_000,
        end_time: null,
        duration: null,
      }),
    ];

    const afterCleanup = sessions.filter((session) => (
      !shouldDeleteSessionByStartTime(session.start_time, cutoffTime)
    ));
    const dashboard = buildDashboardView(afterCleanup, trackerHealth, nowMs);

    assert.equal(
      dashboard.topApplications.some((item) => item.exeName === "old-active.exe"),
      false,
    );
    assert.equal(
      dashboard.topApplications.some((item) => item.exeName === "new-active.exe"),
      true,
    );
  });

  runTest("cleanup deletion on stale tracker does not resurrect removed live sessions", () => {
    const trackerHealth = makeStaleTrackerHealth();
    const nowMs = 30_000;
    const cutoffTime = 20_000;
    const sessions = [
      makeSession({
        id: 3001,
        exe_name: "old-active.exe",
        app_name: "Old Active",
        start_time: 10_000,
        end_time: null,
        duration: null,
      }),
      makeSession({
        id: 3002,
        exe_name: "sealed.exe",
        app_name: "Sealed Session",
        start_time: 12_000,
        end_time: 15_000,
        duration: 3_000,
      }),
    ];
    const afterCleanup = sessions.filter((session) => (
      !shouldDeleteSessionByStartTime(session.start_time, cutoffTime)
    ));
    const history = buildHistoryView({
      daySessions: afterCleanup,
      weeklySessions: afterCleanup,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });
    const dashboard = buildDashboardView(afterCleanup, trackerHealth, nowMs);

    assert.equal(history.timelineSessions.length, 0);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.compiledSessions.length, 0);
    assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
  });

  runTest("tracker health becomes stale when heartbeat exceeds grace window", () => {
    const healthy = resolveTrackerHealth(10_000, 16_000, 8_000);
    const stale = resolveTrackerHealth(10_000, 19_000, 8_000);
    const missing = resolveTrackerHealth(null, 19_000, 8_000);

    assert.equal(healthy.status, "healthy");
    assert.equal(stale.status, "stale");
    assert.equal(missing.status, "stale");
  });

  runTest("live cutoff uses now for healthy tracker and heartbeat fallback for stale tracker", () => {
    const healthy = resolveTrackerHealth(10_000, 12_000, 8_000);
    const stale = resolveTrackerHealth(10_000, 19_000, 8_000);
    const missingHeartbeat = resolveTrackerHealth(null, 19_000, 8_000);

    assert.equal(resolveLiveCutoffMs(healthy, 19_000), 19_000);
    assert.equal(resolveLiveCutoffMs(stale, 19_000), 10_000);
    assert.equal(resolveLiveCutoffMs(missingHeartbeat, 19_000), 0);
  });

  runTest("materializeLiveSessions caps stale live sessions and marks suspicious diagnostics", () => {
    const trackerHealth = makeStaleTrackerHealth();
    const sessions = [
      makeSession({
        id: 1,
        exe_name: "QQ.exe",
        start_time: 10_000,
        end_time: null,
        duration: null,
      }),
      makeSession({
        id: 2,
        exe_name: "Chrome.exe",
        app_name: "Chrome",
        start_time: 1_000,
        end_time: 3_000,
        duration: 2_000,
      }),
    ];

    const materialized = materializeLiveSessions(sessions, trackerHealth, 30_000);

    assert.equal(materialized[0].duration, 5_000);
    assert.deepEqual(materialized[0].diagnosticCodes, ["tracker_stale_live_session"]);
    assert.equal(materialized[0].suspiciousDuration, 5_000);
    assert.equal(materialized[1], sessions[1]);
  });

  runTest("buildReadModelDiagnostics flags warnings and suspicious counts for stale live sessions", () => {
    const trackerHealth = makeStaleTrackerHealth();
    const nowMs = 30_000;
    const liveCutoffMs = resolveLiveCutoffMs(trackerHealth, nowMs);
    const materialized = materializeLiveSessions([
      makeSession({
        id: 1,
        exe_name: "QQ.exe",
        app_name: "QQ",
        start_time: 10_000,
        end_time: null,
        duration: null,
      }),
    ], trackerHealth, nowMs);
    const compiled = compileSessions(materialized, {
      startMs: 0,
      endMs: 40_000,
      minSessionSecs: 0,
    });

    const diagnostics = buildReadModelDiagnostics(compiled, trackerHealth, liveCutoffMs);

    assert.equal(diagnostics.hasWarnings, true);
    assert.equal(diagnostics.suspiciousSessionCount, 1);
    assert.equal(diagnostics.suspiciousDuration, 5_000);
    assert.equal(diagnostics.suspiciousAppCount, 1);
    assert.equal(diagnostics.trackerStatus, "stale");
    assert.equal(diagnostics.liveCutoffMs, 15_000);
  });
}
