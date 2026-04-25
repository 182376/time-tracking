import { RELEASE_DEFAULT_SETTINGS } from "./releaseDefaultProfile.ts";

export type CloseBehavior = "exit" | "tray";
export type MinimizeBehavior = "taskbar" | "widget";

export interface AppSettings {
  idleTimeoutSecs: number;
  timelineMergeGapSecs: number;
  refreshIntervalSecs: number;
  minSessionSecs: number;
  trackingPaused: boolean;
  closeBehavior: CloseBehavior;
  minimizeBehavior: MinimizeBehavior;
  launchAtLogin: boolean;
  startMinimized: boolean;
  onboardingCompleted: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ...RELEASE_DEFAULT_SETTINGS,
};
