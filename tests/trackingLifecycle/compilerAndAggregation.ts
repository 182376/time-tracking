import {
  assert,
  buildDailySummaries,
  buildNormalizedAppStats,
  buildTimelineSessions,
  compileSessions,
  getDayRange,
  getRollingDayRanges,
  makeSession,
  resolveCanonicalDisplayName,
  runTest,
} from "./shared.ts";
import type { HistorySession } from "./shared.ts";

export function runCompilerAndAggregationTests() {
  runTest("normalized app stats keep different executables separate even if display names match", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exeName: "QQ.exe", appName: "QQ", duration: 120_000, endTime: 121_000 }),
      makeSession({ id: 2, exeName: "QQNT.exe", appName: "QQ", startTime: 200_000, endTime: 320_000, duration: 120_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 400_000,
      minSessionSecs: 30,
    });

    const stats = buildNormalizedAppStats(compiled);

    assert.equal(stats.length, 2);
    assert.deepEqual(
      stats.map((item) => item.exeName).sort(),
      ["QQ.exe", "QQNT.exe"].sort(),
    );
  });

  runTest("normalized app stats merge known alias executables into one app group", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exeName: "douyin.exe", appName: "\u6296\u97f3", startTime: 0, endTime: 120_000, duration: 120_000 }),
      makeSession({ id: 2, exeName: "DouYin_Tray.exe", appName: "Douyin_tray", startTime: 130_000, endTime: 190_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 300_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].exeName.toLowerCase(), "douyin.exe");
    assert.equal(stats[0].appName, resolveCanonicalDisplayName("douyin.exe"));
    assert.equal(stats[0].totalDuration, 180_000);
  });

  runTest("alias-first sessions still use canonical display name", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exeName: "DouYin_Tray.exe", appName: "Douyin_tray", startTime: 0, endTime: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exeName: "douyin.exe", appName: "\u6296\u97f3", startTime: 65_000, endTime: 125_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 300_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].exeName.toLowerCase(), "douyin.exe");
    assert.equal(stats[0].appName, resolveCanonicalDisplayName("douyin.exe"));
  });

  runTest("installer windows are filtered instead of collapsing into the owning app", () => {
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exeName: "alma-0.0.750-win-x64.exe",
        appName: "Alma Installer",
        windowTitle: "Alma \u5b89\u88c5",
        startTime: 0,
        endTime: 20_000,
        duration: 20_000,
      }),
      makeSession({
        id: 2,
        exeName: "Alma.exe",
        appName: "Alma",
        windowTitle: "Alma",
        startTime: 25_000,
        endTime: 85_000,
        duration: 60_000,
      }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 120_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);

    assert.equal(stats.length, 1);
    assert.equal(stats[0].exeName.toLowerCase(), "alma.exe");
    assert.equal(stats[0].appName, "Alma");
    assert.equal(stats[0].totalDuration, 60_000);
  });

  runTest("non-aliased apps prefer session appName for display", () => {
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exeName: "snowshot.exe",
        appName: "Snow Shot",
        windowTitle: "Snow Shot",
        startTime: 0,
        endTime: 60_000,
        duration: 60_000,
      }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 120_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);

    assert.equal(stats.length, 1);
    assert.equal(stats[0].appName, "Snow Shot");
  });

  runTest("empty executable rows are excluded from compiled sessions", () => {
    const compiled = compileSessions([
      makeSession({ id: 1, exeName: "", appName: "", windowTitle: "", startTime: 0, endTime: 60_000, duration: 60_000 }),
    ], {
      startMs: 0,
      endMs: 100_000,
      minSessionSecs: 0,
    });

    assert.equal(compiled.length, 0);
  });

  runTest("short same-app fragments survive when filtering happens after merge", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exeName: "QQ.exe", startTime: 0, endTime: 20_000, duration: 20_000 }),
      makeSession({ id: 2, exeName: "QQ.exe", startTime: 22_000, endTime: 42_000, duration: 20_000, windowTitle: "QQ Other" }),
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
      makeSession({ id: 1, exeName: "QQ.exe", appName: "QQ", startTime: 0, endTime: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exeName: "QQNT.exe", appName: "QQ", startTime: 62_000, endTime: 122_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 200_000,
      minSessionSecs: 30,
    });
    const timeline = buildTimelineSessions(compiled, 180);

    assert.equal(timeline.length, 2);
    assert.deepEqual(
      timeline.map((item) => item.exeName),
      ["QQ.exe", "QQNT.exe"],
    );
  });

  runTest("timeline grouping preserves active duration while extending the visible span", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exeName: "QQ.exe", startTime: 0, endTime: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exeName: "Chrome.exe", appName: "Chrome", startTime: 60_000, endTime: 90_000, duration: 30_000 }),
      makeSession({ id: 3, exeName: "QQ.exe", startTime: 90_000, endTime: 150_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 200_000,
      minSessionSecs: 30,
    });
    const timeline = buildTimelineSessions(compiled, 180);

    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].startTime, 0);
    assert.equal(timeline[0].endTime, 150_000);
    assert.equal(timeline[0].duration, 120_000);
  });

  runTest("timeline grouping can follow persisted continuity anchors even when the visible interruption exceeds the merge threshold", () => {
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exeName: "Zoom.exe",
        appName: "Zoom",
        startTime: 0,
        endTime: 60_000,
        duration: 60_000,
        continuityGroupStartTime: 0,
      }),
      makeSession({
        id: 2,
        exeName: "QQ.exe",
        appName: "QQ",
        startTime: 60_000,
        endTime: 120_000,
        duration: 60_000,
        continuityGroupStartTime: 60_000,
      }),
      makeSession({
        id: 3,
        exeName: "Zoom.exe",
        appName: "Zoom",
        startTime: 120_000,
        endTime: 180_000,
        duration: 60_000,
        continuityGroupStartTime: 0,
      }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 200_000,
      minSessionSecs: 0,
    });
    const timeline = buildTimelineSessions(compiled, 10);

    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].startTime, 0);
    assert.equal(timeline[0].endTime, 180_000);
    assert.equal(timeline[0].duration, 120_000);
  });

  runTest("day compilation clips cross-day sessions to the selected date", () => {
    const day = new Date(2026, 3, 4, 12, 0, 0, 0);
    const range = getDayRange(day, new Date(2026, 3, 5, 0, 0, 0, 0).getTime());
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        startTime: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
        endTime: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
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
        startTime: new Date(2026, 3, 3, 23, 50, 0, 0).getTime(),
        endTime: new Date(2026, 3, 4, 0, 20, 0, 0).getTime(),
        duration: 30 * 60_000,
      }),
    ];
    const summaries = buildDailySummaries(sessions, ranges, 30);

    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].totalDuration, 10 * 60_000);
    assert.equal(summaries[1].totalDuration, 20 * 60_000);
  });

  runTest("daily summaries stay consistent with per-day compiled totals", () => {
    const nowMs = new Date(2026, 3, 4, 12, 0, 0, 0).getTime();
    const ranges = getRollingDayRanges(3, nowMs);
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exeName: "QQ.exe",
        startTime: new Date(2026, 3, 2, 23, 59, 30, 0).getTime(),
        endTime: new Date(2026, 3, 3, 0, 1, 0, 0).getTime(),
        duration: 90_000,
      }),
      makeSession({
        id: 2,
        exeName: "Chrome.exe",
        appName: "Chrome",
        startTime: new Date(2026, 3, 4, 8, 0, 0, 0).getTime(),
        endTime: new Date(2026, 3, 4, 9, 0, 0, 0).getTime(),
        duration: 60 * 60_000,
      }),
    ];

    const summaries = buildDailySummaries(sessions, ranges, 30);
    const compiledTotals = ranges.map((range) => (
      compileSessions(sessions, {
        startMs: range.startMs,
        endMs: range.endMs,
        minSessionSecs: 30,
      }).reduce((sum, session) => sum + Math.max(0, session.duration ?? 0), 0)
    ));

    assert.deepEqual(
      summaries.map((item) => item.totalDuration),
      compiledTotals,
    );
  });

  runTest("compiler removes PickerHost from read model", () => {
    const compiled = compileSessions([
      makeSession({ id: 1, exeName: "PickerHost.exe", appName: "PickerHost", startTime: 0, endTime: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exeName: "QQ.exe", appName: "QQ", startTime: 60_000, endTime: 120_000, duration: 60_000 }),
    ], {
      startMs: 0,
      endMs: 200_000,
      minSessionSecs: 0,
    });

    assert.equal(compiled.length, 1);
    assert.equal(compiled[0].exeName, "QQ.exe");
  });
}
