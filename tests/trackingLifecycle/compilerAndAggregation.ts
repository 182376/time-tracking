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

  runTest("normalized app stats merge known alias executables into one app group", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exe_name: "douyin.exe", app_name: "\u6296\u97f3", start_time: 0, end_time: 120_000, duration: 120_000 }),
      makeSession({ id: 2, exe_name: "DouYin_Tray.exe", app_name: "Douyin_tray", start_time: 130_000, end_time: 190_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 300_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].exe_name.toLowerCase(), "douyin.exe");
    assert.equal(stats[0].app_name, resolveCanonicalDisplayName("douyin.exe"));
    assert.equal(stats[0].total_duration, 180_000);
  });

  runTest("alias-first sessions still use canonical display name", () => {
    const sessions: HistorySession[] = [
      makeSession({ id: 1, exe_name: "DouYin_Tray.exe", app_name: "Douyin_tray", start_time: 0, end_time: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exe_name: "douyin.exe", app_name: "\u6296\u97f3", start_time: 65_000, end_time: 125_000, duration: 60_000 }),
    ];
    const compiled = compileSessions(sessions, {
      startMs: 0,
      endMs: 300_000,
      minSessionSecs: 0,
    });
    const stats = buildNormalizedAppStats(compiled);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].exe_name.toLowerCase(), "douyin.exe");
    assert.equal(stats[0].app_name, resolveCanonicalDisplayName("douyin.exe"));
  });

  runTest("installer windows are filtered instead of collapsing into the owning app", () => {
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exe_name: "alma-0.0.750-win-x64.exe",
        app_name: "Alma Installer",
        window_title: "Alma \u5b89\u88c5",
        start_time: 0,
        end_time: 20_000,
        duration: 20_000,
      }),
      makeSession({
        id: 2,
        exe_name: "Alma.exe",
        app_name: "Alma",
        window_title: "Alma",
        start_time: 25_000,
        end_time: 85_000,
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
    assert.equal(stats[0].exe_name.toLowerCase(), "alma.exe");
    assert.equal(stats[0].app_name, "Alma");
    assert.equal(stats[0].total_duration, 60_000);
  });

  runTest("non-aliased apps prefer session app_name for display", () => {
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exe_name: "snowshot.exe",
        app_name: "Snow Shot",
        window_title: "Snow Shot",
        start_time: 0,
        end_time: 60_000,
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
    assert.equal(stats[0].app_name, "Snow Shot");
  });

  runTest("empty executable rows are excluded from compiled sessions", () => {
    const compiled = compileSessions([
      makeSession({ id: 1, exe_name: "", app_name: "", window_title: "", start_time: 0, end_time: 60_000, duration: 60_000 }),
    ], {
      startMs: 0,
      endMs: 100_000,
      minSessionSecs: 0,
    });

    assert.equal(compiled.length, 0);
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

  runTest("daily summaries stay consistent with per-day compiled totals", () => {
    const nowMs = new Date(2026, 3, 4, 12, 0, 0, 0).getTime();
    const ranges = getRollingDayRanges(3, nowMs);
    const sessions: HistorySession[] = [
      makeSession({
        id: 1,
        exe_name: "QQ.exe",
        start_time: new Date(2026, 3, 2, 23, 59, 30, 0).getTime(),
        end_time: new Date(2026, 3, 3, 0, 1, 0, 0).getTime(),
        duration: 90_000,
      }),
      makeSession({
        id: 2,
        exe_name: "Chrome.exe",
        app_name: "Chrome",
        start_time: new Date(2026, 3, 4, 8, 0, 0, 0).getTime(),
        end_time: new Date(2026, 3, 4, 9, 0, 0, 0).getTime(),
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
      summaries.map((item) => item.total_duration),
      compiledTotals,
    );
  });

  runTest("compiler removes PickerHost from read model", () => {
    const compiled = compileSessions([
      makeSession({ id: 1, exe_name: "PickerHost.exe", app_name: "PickerHost", start_time: 0, end_time: 60_000, duration: 60_000 }),
      makeSession({ id: 2, exe_name: "QQ.exe", app_name: "QQ", start_time: 60_000, end_time: 120_000, duration: 60_000 }),
    ], {
      startMs: 0,
      endMs: 200_000,
      minSessionSecs: 0,
    });

    assert.equal(compiled.length, 1);
    assert.equal(compiled[0].exe_name, "QQ.exe");
  });
}
