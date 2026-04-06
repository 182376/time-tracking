import assert from "node:assert/strict";
import { HistoryReadModelService } from "../src/shared/lib/historyReadModelService.ts";
import type { HistorySession } from "../src/shared/lib/sessionReadRepository.ts";
import { resolveTrackerHealth } from "../src/types/tracking.ts";

function makeSession(overrides: Partial<HistorySession>): HistorySession {
  return {
    id: 1,
    app_name: "Unknown",
    exe_name: "unknown.exe",
    window_title: "",
    start_time: 0,
    end_time: 0,
    duration: 0,
    ...overrides,
  };
}

const trackerHealth = resolveTrackerHealth(400_000, 400_000, 8_000);

const daySessions: HistorySession[] = [
  makeSession({
    id: 1,
    app_name: "Google Chrome",
    exe_name: "chrome.exe",
    start_time: 0,
    end_time: 60_000,
    duration: 60_000,
  }),
  makeSession({
    id: 2,
    app_name: "Douyin_tray",
    exe_name: "Douyin_tray.exe",
    start_time: 65_000,
    end_time: 125_000,
    duration: 60_000,
  }),
  makeSession({
    id: 3,
    app_name: "抖音",
    exe_name: "douyin.exe",
    start_time: 130_000,
    end_time: 190_000,
    duration: 60_000,
  }),
  makeSession({
    id: 4,
    app_name: "QQ",
    exe_name: "QQ.exe",
    start_time: 200_000,
    end_time: 260_000,
    duration: 60_000,
  }),
  makeSession({
    id: 5,
    app_name: "PickerHost",
    exe_name: "PickerHost.exe",
    start_time: 270_000,
    end_time: 330_000,
    duration: 60_000,
  }),
];

const readModel = HistoryReadModelService.buildHistoryReadModel({
  daySessions,
  weeklySessions: daySessions,
  selectedDate: new Date(0),
  trackerHealth,
  nowMs: 400_000,
  minSessionSecs: 0,
  mergeThresholdSecs: 180,
});

assert.equal(
  readModel.appSummary.some((item) => item.exeName.toLowerCase().includes("pickerhost")),
  false,
);
assert.equal(
  readModel.appSummary.filter((item) => item.exeName.toLowerCase() === "douyin.exe").length,
  1,
);
assert.equal(
  readModel.appSummary.find((item) => item.exeName.toLowerCase() === "douyin.exe")?.duration,
  120_000,
);

const dashboard = HistoryReadModelService.buildDashboardReadModel(daySessions, trackerHealth, 400_000);
assert.equal(
  dashboard.topApplications.some((item) => item.exeName.toLowerCase().includes("pickerhost")),
  false,
);
assert.equal(
  dashboard.topApplications.filter((item) => item.exeName.toLowerCase() === "douyin.exe").length,
  1,
);
assert.equal(
  dashboard.topApplications.some((item) => item.exeName.toLowerCase() === "qq.exe"),
  true,
);

console.log("PASS tracking replay scenario");
