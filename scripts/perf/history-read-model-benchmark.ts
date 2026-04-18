import { performance } from "node:perf_hooks";
import { buildTimelineSessions } from "../../src/shared/lib/sessionReadCompiler.ts";
import { compileForRange, materializeLiveSessions } from "../../src/shared/lib/readModelCore.ts";
import { buildHistoryReadModel } from "../../src/features/history/services/historyReadModel.ts";
import { resolveTrackerHealth } from "../../src/shared/types/tracking.ts";
import type { HistorySession } from "../../src/shared/lib/sessionReadRepository.ts";

function makeSession(id: number, startTime: number, duration: number, exeName: string): HistorySession {
  return {
    id,
    app_name: exeName.replace(/\.exe$/i, ""),
    exe_name: exeName,
    window_title: `${exeName} Window ${id}`,
    start_time: startTime,
    end_time: startTime + duration,
    duration,
  };
}

function buildSyntheticSessions(): HistorySession[] {
  const sessions: HistorySession[] = [];
  const executables = ["QQ.exe", "chrome.exe", "cursor.exe", "Code.exe", "WeChat.exe"];
  const baseStart = new Date(2026, 3, 18, 0, 0, 0, 0).getTime();

  for (let day = 0; day < 7; day += 1) {
    const dayStart = baseStart - day * 24 * 60 * 60 * 1000;
    for (let index = 0; index < 700; index += 1) {
      const exeName = executables[index % executables.length];
      const startTime = dayStart + index * 60_000;
      const duration = 30_000 + (index % 9) * 10_000;
      sessions.push(makeSession(day * 1000 + index, startTime, duration, exeName));
    }
  }

  return sessions;
}

function measure(label: string, run: () => void, iterations: number) {
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    run();
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    label,
    iterations,
    elapsedMs,
    averageMs: elapsedMs / iterations,
  };
}

const sessions = buildSyntheticSessions();
const trackerHealth = resolveTrackerHealth(Date.now(), Date.now(), 8_000);
const selectedDate = new Date(2026, 3, 18, 12, 0, 0, 0);
const nowMs = selectedDate.getTime();
const rangeStart = new Date(2026, 3, 18, 0, 0, 0, 0).getTime();
const rangeEnd = new Date(2026, 3, 19, 0, 0, 0, 0).getTime();
const iterations = 250;

const liveSessions = materializeLiveSessions(sessions, trackerHealth, nowMs);

const baseline = measure("baseline-double-compile", () => {
  const compiledSessions = compileForRange(liveSessions, { startMs: rangeStart, endMs: rangeEnd }, 0);
  const timelineSourceSessions = compileForRange(liveSessions, { startMs: rangeStart, endMs: rangeEnd }, 0);
  buildTimelineSessions(timelineSourceSessions, 180);
  void compiledSessions;
}, iterations);

const optimized = measure("optimized-single-compile", () => {
  buildHistoryReadModel({
    daySessions: sessions,
    weeklySessions: sessions,
    selectedDate,
    trackerHealth,
    nowMs,
    minSessionSecs: 0,
    mergeThresholdSecs: 180,
  });
}, iterations);

const improvementMs = baseline.averageMs - optimized.averageMs;
const improvementRatio = baseline.averageMs === 0 ? 0 : improvementMs / baseline.averageMs;

console.log(JSON.stringify({
  baseline,
  optimized,
  improvementMs,
  improvementRatio,
}, null, 2));
