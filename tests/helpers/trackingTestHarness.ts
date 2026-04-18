import type { HistorySession } from "../../src/shared/lib/sessionReadRepository.ts";
import type { TrackedWindow } from "../../src/shared/types/tracking.ts";

export function makeWindow(overrides: Partial<TrackedWindow> = {}): TrackedWindow {
  return {
    hwnd: "0x100",
    root_owner_hwnd: "0x100",
    process_id: 123,
    window_class: "Chrome_WidgetWin_1",
    title: "Window",
    exe_name: "QQ.exe",
    process_path: "C:\\Program Files\\QQ\\QQ.exe",
    is_afk: false,
    idle_time_ms: 0,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<HistorySession> = {}): HistorySession {
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

export function createTestHarness() {
  let passed = 0;
  const pending: Promise<void>[] = [];

  return {
    run(name: string, fn: () => void | Promise<void>) {
      try {
        const result = fn();
        if (result && typeof (result as Promise<void>).then === "function") {
          pending.push(
            Promise.resolve(result)
              .then(() => {
                passed += 1;
                console.log(`PASS ${name}`);
              })
              .catch((error) => {
                console.error(`FAIL ${name}`);
                throw error;
              }),
          );
          return;
        }

        passed += 1;
        console.log(`PASS ${name}`);
      } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
      }
    },
    async finish(label: string) {
      await Promise.all(pending);
      console.log(`Passed ${passed} ${label} tests`);
    },
  };
}
