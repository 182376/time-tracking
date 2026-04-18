import {
  applyTrackingDataChangedPayload,
  applyMappingOverridesReadModelRefresh,
  applySessionDeletionReadModelRefresh,
  assert,
  HistoryReadModelService,
  INITIAL_READ_MODEL_REFRESH_STATE,
  loadDashboardRuntimeSnapshotWithDeps,
  loadHistoryRuntimeSnapshotWithDeps,
  makeSession,
  resolveTrackerHealth,
  resolveReadModelRefreshSignal,
  runTest,
  shouldDeleteSessionByStartTime,
} from "./shared.ts";

export function runReadModelRuntimeTests() {
  runTest("read model refresh signal combines tracking sync tick with local refresh tick", () => {
    const refreshSignal = resolveReadModelRefreshSignal(3, {
      mappingVersion: 2,
      dataRefreshTick: 4,
    });

    assert.equal(refreshSignal, 7);
  });

  runTest("mapping override refresh bumps both mapping version and local refresh tick", () => {
    const nextState = applyMappingOverridesReadModelRefresh(INITIAL_READ_MODEL_REFRESH_STATE);

    assert.deepEqual(nextState, {
      mappingVersion: 1,
      dataRefreshTick: 1,
    });
    assert.equal(resolveReadModelRefreshSignal(5, nextState), 6);
  });

  runTest("session deletion refresh keeps mapping version stable and only bumps refresh tick", () => {
    const nextState = applySessionDeletionReadModelRefresh({
      mappingVersion: 2,
      dataRefreshTick: 3,
    });

    assert.deepEqual(nextState, {
      mappingVersion: 2,
      dataRefreshTick: 4,
    });
    assert.equal(resolveReadModelRefreshSignal(5, nextState), 9);
  });

  runTest("dashboard runtime snapshot waits for mapper runtime before loading and caching", async () => {
    const events: string[] = [];
    const date = new Date("2026-04-18T09:30:00.000Z");
    const snapshot = {
      fetchedAtMs: 123,
      icons: { "QQ.exe": "icon" },
      sessions: [],
    };

    const result = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {
        events.push("ensure");
      },
      loadDashboardSnapshot: async (receivedDate) => {
        events.push(`load:${receivedDate?.toISOString()}`);
        return snapshot;
      },
      setDashboardSnapshotCache: (receivedSnapshot, receivedDate) => {
        events.push(`cache:${receivedDate?.toISOString()}`);
        assert.equal(receivedSnapshot, snapshot);
      },
    });

    assert.equal(result, snapshot);
    assert.deepEqual(events, [
      "ensure",
      `load:${date.toISOString()}`,
      `cache:${date.toISOString()}`,
    ]);
  });

  runTest("history runtime snapshot keeps rolling range aligned across loader and cache", async () => {
    const events: string[] = [];
    const date = new Date("2026-04-18T09:30:00.000Z");
    const snapshot = {
      fetchedAtMs: 456,
      daySessions: [],
      weeklySessions: [],
    };

    const result = await loadHistoryRuntimeSnapshotWithDeps(date, 14, {
      ensureProcessMapperRuntimeReady: async () => {
        events.push("ensure");
      },
      loadHistorySnapshot: async (receivedDate, receivedRollingDayCount) => {
        events.push(`load:${receivedDate.toISOString()}:${receivedRollingDayCount}`);
        return snapshot;
      },
      setHistorySnapshotCache: (receivedSnapshot, receivedDate, receivedRollingDayCount) => {
        events.push(`cache:${receivedDate?.toISOString()}:${receivedRollingDayCount}`);
        assert.equal(receivedSnapshot, snapshot);
      },
    });

    assert.equal(result, snapshot);
    assert.deepEqual(events, [
      "ensure",
      `load:${date.toISOString()}:14`,
      `cache:${date.toISOString()}:14`,
    ]);
  });

  runTest("startup sealed runtime refresh reloads sealed sessions into stale read models end-to-end", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 30_000;
    const trackerHealth = resolveTrackerHealth(18_000, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 1,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 10_000,
        end_time: 18_000,
        duration: 8_000,
        window_title: "Recovered",
      }),
    ];
    const events: string[] = [];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;
    let appSettingsSetCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "startup-sealed",
      changed_at_ms: nowMs,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        appSettingsSetCalls += 1;
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("startup seal refresh should not warn");
      },
    });

    const refreshSignal = resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE);
    assert.equal(refreshSignal, 1);
    assert.equal(pauseSettingLoadCalls, 0);
    assert.equal(appSettingsSetCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {
        events.push("dashboard:ensure");
      },
      loadDashboardSnapshot: async (receivedDate) => {
        events.push(`dashboard:load:${receivedDate?.toISOString()}`);
        return {
          fetchedAtMs: nowMs,
          icons: {},
          sessions,
        };
      },
      setDashboardSnapshotCache: (snapshot, receivedDate) => {
        events.push(`dashboard:cache:${receivedDate?.toISOString()}`);
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {
        events.push("history:ensure");
      },
      loadHistorySnapshot: async (receivedDate, receivedRollingDayCount) => {
        events.push(`history:load:${receivedDate.toISOString()}:${receivedRollingDayCount}`);
        return {
          fetchedAtMs: nowMs,
          daySessions: sessions,
          weeklySessions: sessions,
        };
      },
      setHistorySnapshotCache: (snapshot, receivedDate, receivedRollingDayCount) => {
        events.push(`history:cache:${receivedDate?.toISOString()}:${receivedRollingDayCount}`);
        assert.equal(snapshot.daySessions, sessions);
        assert.equal(snapshot.weeklySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions[0]?.duration, 8_000);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.compiledSessions[0]?.duration, 8_000);
    assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
    assert.deepEqual(events, [
      "dashboard:ensure",
      `dashboard:load:${date.toISOString()}`,
      `dashboard:cache:${date.toISOString()}`,
      "history:ensure",
      `history:load:${date.toISOString()}:7`,
      `history:cache:${date.toISOString()}:7`,
    ]);
  });

  runTest("backup restored runtime refresh reloads restored sessions into dashboard and history read models", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 40_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const restoredSessions = [
      makeSession({
        id: 11,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 20_000,
        end_time: 28_000,
        duration: 8_000,
        window_title: "Recovered editor",
      }),
      makeSession({
        id: 12,
        app_name: "QQ",
        exe_name: "qq.exe",
        start_time: 30_000,
        end_time: 34_000,
        duration: 4_000,
        window_title: "Recovered chat",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "backup-restored",
      changed_at_ms: nowMs,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        throw new Error("backup restore should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("backup restore refresh should not warn");
      },
    });

    const refreshSignal = resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE);
    assert.equal(refreshSignal, 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions: restoredSessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, restoredSessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: restoredSessions,
        weeklySessions: restoredSessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, restoredSessions);
        assert.equal(snapshot.weeklySessions, restoredSessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 2);
    assert.equal(history.timelineSessions[0]?.exe_name, "qq.exe");
    assert.equal(history.timelineSessions[1]?.exe_name, "cursor.exe");
    assert.equal(dashboard.totalTrackedTime, 12_000);
    assert.equal(dashboard.topApplications[0]?.exeName, "cursor.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 8_000);
  });

  runTest("watchdog sealed runtime refresh reloads watchdog-closed sessions into stale read models", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 30_000;
    const trackerHealth = resolveTrackerHealth(15_000, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 21,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 10_000,
        end_time: 15_000,
        duration: 5_000,
        window_title: "Watchdog recovered",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "watchdog-sealed",
      changed_at_ms: 15_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        throw new Error("watchdog seal should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("watchdog seal refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: sessions,
        weeklySessions: sessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 1);
    assert.equal(history.timelineSessions[0]?.duration, 5_000);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.compiledSessions.length, 1);
    assert.equal(dashboard.compiledSessions[0]?.duration, 5_000);
    assert.equal(dashboard.diagnostics.suspiciousSessionCount, 0);
  });

  runTest("tracking paused sealed runtime refresh reloads sealed sessions without pause resync", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 26_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 26,
        app_name: "WeChat",
        exe_name: "wechat.exe",
        start_time: 10_000,
        end_time: 22_000,
        duration: 12_000,
        window_title: "Paused chat",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "tracking-paused-sealed",
      changed_at_ms: 22_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return true;
      },
      setAppSettings: () => {
        throw new Error("tracking-paused-sealed should not sync pause setting again");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("tracking-paused-sealed refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: sessions,
        weeklySessions: sessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, sessions);
        assert.equal(snapshot.weeklySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 1);
    assert.equal(history.timelineSessions[0]?.exe_name, "wechat.exe");
    assert.equal(history.timelineSessions[0]?.duration, 12_000);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.totalTrackedTime, 12_000);
    assert.equal(dashboard.topApplications[0]?.exeName, "wechat.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 12_000);
  });

  runTest("lock-ended runtime refresh reloads power-sealed sessions without pause sync", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 25_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 31,
        app_name: "QQ",
        exe_name: "qq.exe",
        start_time: 10_000,
        end_time: 20_000,
        duration: 10_000,
        window_title: "Locked chat",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "session-ended-lock",
      changed_at_ms: 20_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return true;
      },
      setAppSettings: () => {
        throw new Error("lock-ended refresh should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("lock-ended refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: sessions,
        weeklySessions: sessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 1);
    assert.equal(history.timelineSessions[0]?.duration, 10_000);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.totalTrackedTime, 10_000);
    assert.equal(dashboard.topApplications[0]?.exeName, "qq.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 10_000);
  });

  runTest("suspend-ended runtime refresh reloads power-sealed sessions without pause sync", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 32_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 41,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 12_000,
        end_time: 24_000,
        duration: 12_000,
        window_title: "Suspended editor",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "session-ended-suspend",
      changed_at_ms: 24_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return true;
      },
      setAppSettings: () => {
        throw new Error("suspend-ended refresh should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("suspend-ended refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: sessions,
        weeklySessions: sessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, sessions);
        assert.equal(snapshot.weeklySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 1);
    assert.equal(history.timelineSessions[0]?.duration, 12_000);
    assert.equal(history.timelineSessions[0]?.exe_name, "cursor.exe");
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.totalTrackedTime, 12_000);
    assert.equal(dashboard.topApplications[0]?.exeName, "cursor.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 12_000);
  });

  runTest("startup sealed cleanup on stale tracker does not resurrect sessions removed before cutoff", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 40_000;
    const trackerHealth = resolveTrackerHealth(18_000, nowMs, 8_000);
    const cleanupCutoffTime = 20_000;
    const sealedSessions = [
      makeSession({
        id: 51,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 10_000,
        end_time: 18_000,
        duration: 8_000,
        window_title: "Cleaned sealed session",
      }),
      makeSession({
        id: 52,
        app_name: "QQ",
        exe_name: "qq.exe",
        start_time: 24_000,
        end_time: 30_000,
        duration: 6_000,
        window_title: "Retained sealed session",
      }),
    ];
    const persistedSessions = sealedSessions.filter((session) => (
      !shouldDeleteSessionByStartTime(session.start_time, cleanupCutoffTime)
    ));
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "startup-sealed",
      changed_at_ms: 18_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        throw new Error("startup seal refresh should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("startup seal cleanup refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions: persistedSessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, persistedSessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: persistedSessions,
        weeklySessions: persistedSessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, persistedSessions);
        assert.equal(snapshot.weeklySessions, persistedSessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(persistedSessions.length, 1);
    assert.equal(persistedSessions[0]?.exe_name, "qq.exe");
    assert.equal(history.timelineSessions.length, 1);
    assert.equal(history.timelineSessions[0]?.exe_name, "qq.exe");
    assert.equal(history.timelineSessions.some((session) => session.exe_name === "cursor.exe"), false);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.compiledSessions.length, 1);
    assert.equal(dashboard.compiledSessions[0]?.exe_name, "qq.exe");
    assert.equal(dashboard.topApplications.some((item) => item.exeName === "cursor.exe"), false);
    assert.equal(dashboard.topApplications[0]?.exeName, "qq.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 6_000);
  });

  runTest("session transition runtime refresh reloads live sessions into dashboard and history read models", async () => {
    const date = new Date("1970-01-01T00:00:00.000Z");
    const nowMs = 30_000;
    const trackerHealth = resolveTrackerHealth(nowMs, nowMs, 8_000);
    const sessions = [
      makeSession({
        id: 61,
        app_name: "Cursor",
        exe_name: "cursor.exe",
        start_time: 16_000,
        end_time: 20_000,
        duration: 4_000,
        window_title: "Previous editor",
      }),
      makeSession({
        id: 62,
        app_name: "QQ",
        exe_name: "qq.exe",
        start_time: 25_000,
        end_time: null,
        duration: null,
        window_title: "Live chat",
      }),
    ];
    let syncTick = 0;
    let pauseSettingLoadCalls = 0;

    await applyTrackingDataChangedPayload({
      reason: "session-transition",
      changed_at_ms: 25_000,
    }, {
      loadLatestTrackingPauseSetting: async () => {
        pauseSettingLoadCalls += 1;
        return false;
      },
      setAppSettings: () => {
        throw new Error("session transition should not sync pause setting");
      },
      bumpSyncTick: () => {
        syncTick += 1;
      },
      warn: () => {
        throw new Error("session transition refresh should not warn");
      },
    });

    assert.equal(resolveReadModelRefreshSignal(syncTick, INITIAL_READ_MODEL_REFRESH_STATE), 1);
    assert.equal(pauseSettingLoadCalls, 0);

    const dashboardSnapshot = await loadDashboardRuntimeSnapshotWithDeps(date, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadDashboardSnapshot: async () => ({
        fetchedAtMs: nowMs,
        icons: {},
        sessions,
      }),
      setDashboardSnapshotCache: (snapshot) => {
        assert.equal(snapshot.sessions, sessions);
      },
    });
    const historySnapshot = await loadHistoryRuntimeSnapshotWithDeps(date, 7, {
      ensureProcessMapperRuntimeReady: async () => {},
      loadHistorySnapshot: async () => ({
        fetchedAtMs: nowMs,
        daySessions: sessions,
        weeklySessions: sessions,
      }),
      setHistorySnapshotCache: (snapshot) => {
        assert.equal(snapshot.daySessions, sessions);
        assert.equal(snapshot.weeklySessions, sessions);
      },
    });

    const dashboard = HistoryReadModelService.buildDashboardReadModel(
      dashboardSnapshot.sessions,
      trackerHealth,
      nowMs,
    );
    const history = HistoryReadModelService.buildHistoryReadModel({
      daySessions: historySnapshot.daySessions,
      weeklySessions: historySnapshot.weeklySessions,
      selectedDate: date,
      trackerHealth,
      nowMs,
      minSessionSecs: 0,
      mergeThresholdSecs: 180,
    });

    assert.equal(history.timelineSessions.length, 2);
    assert.equal(history.timelineSessions[0]?.exe_name, "qq.exe");
    assert.equal(history.timelineSessions[0]?.duration, 5_000);
    assert.equal(history.timelineSessions[1]?.exe_name, "cursor.exe");
    assert.equal(history.timelineSessions[1]?.duration, 4_000);
    assert.equal(history.diagnostics.suspiciousSessionCount, 0);
    assert.equal(dashboard.totalTrackedTime, 9_000);
    assert.equal(dashboard.topApplications[0]?.exeName, "qq.exe");
    assert.equal(dashboard.topApplications[0]?.duration, 5_000);
  });
}
