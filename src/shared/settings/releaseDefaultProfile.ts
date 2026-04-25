export interface ReleaseDefaultSettingsProfile {
  idleTimeoutSecs: number;
  timelineMergeGapSecs: number;
  refreshIntervalSecs: number;
  minSessionSecs: number;
  trackingPaused: boolean;
  closeBehavior: "exit" | "tray";
  minimizeBehavior: "taskbar" | "widget";
  launchAtLogin: boolean;
  startMinimized: boolean;
  onboardingCompleted: boolean;
}

export const RELEASE_DEFAULT_SETTINGS: ReleaseDefaultSettingsProfile = {
  idleTimeoutSecs: 900,
  timelineMergeGapSecs: 180,
  refreshIntervalSecs: 2,
  minSessionSecs: 120,
  trackingPaused: false,
  closeBehavior: "exit",
  minimizeBehavior: "taskbar",
  launchAtLogin: true,
  startMinimized: true,
  onboardingCompleted: true,
};
