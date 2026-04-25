import type { HistorySession } from "../../src/shared/lib/sessionReadRepository.ts";
import type { TrackedWindow } from "../../src/shared/types/tracking.ts";

export function makeWindow(overrides: Partial<TrackedWindow> = {}): TrackedWindow {
  return {
    hwnd: "0x100",
    rootOwnerHwnd: "0x100",
    processId: 123,
    windowClass: "Chrome_WidgetWin_1",
    title: "Window",
    exeName: "QQ.exe",
    processPath: "C:\\Program Files\\QQ\\QQ.exe",
    isAfk: false,
    idleTimeMs: 0,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<HistorySession> = {}): HistorySession {
  const session: HistorySession = {
    id: 1,
    appName: "QQ",
    exeName: "QQ.exe",
    windowTitle: "QQ Chat",
    startTime: 1_000,
    endTime: 11_000,
    duration: 10_000,
    continuityGroupStartTime: null,
    ...overrides,
  };

  return {
    ...session,
    continuityGroupStartTime:
      session.continuityGroupStartTime ?? session.startTime,
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
