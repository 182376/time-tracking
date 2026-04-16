export interface ReleaseDefaultSettingsProfile {
  idle_timeout_secs: number;
  timeline_merge_gap_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
  tracking_paused: boolean;
  close_behavior: "exit" | "tray";
  minimize_behavior: "taskbar" | "tray";
  launch_at_login: boolean;
  start_minimized: boolean;
  onboarding_completed: boolean;
}

export const RELEASE_DEFAULT_SETTINGS: ReleaseDefaultSettingsProfile = {
  idle_timeout_secs: 900,
  timeline_merge_gap_secs: 180,
  refresh_interval_secs: 2,
  min_session_secs: 120,
  tracking_paused: false,
  close_behavior: "exit",
  minimize_behavior: "taskbar",
  launch_at_login: true,
  start_minimized: true,
  onboarding_completed: true,
};
