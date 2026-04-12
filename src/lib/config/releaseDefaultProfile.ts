import type { UserAssignableAppCategory } from "./categoryTokens";

export interface ReleaseDefaultSettingsProfile {
  afk_timeout_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
  tracking_paused: boolean;
  close_behavior: "exit" | "tray";
  minimize_behavior: "taskbar" | "tray";
  launch_at_login: boolean;
  start_minimized: boolean;
  onboarding_completed: boolean;
}

type BuiltinAssignableCategoryForDefaultColor = Exclude<UserAssignableAppCategory, "other">;

export const RELEASE_DEFAULT_SETTINGS: ReleaseDefaultSettingsProfile = {
  afk_timeout_secs: 180,
  refresh_interval_secs: 3,
  min_session_secs: 60,
  tracking_paused: false,
  close_behavior: "exit",
  minimize_behavior: "taskbar",
  launch_at_login: true,
  start_minimized: true,
  onboarding_completed: true,
};

export const RELEASE_DEFAULT_CATEGORY_COLOR_ASSIGNMENTS: Record<BuiltinAssignableCategoryForDefaultColor, string> = {
  ai: "#3293C8",
  development: "#4790CF",
  office: "#6F7AE6",
  browser: "#36AC7E",
  communication: "#C56A73",
  meeting: "#BE657D",
  video: "#66955C",
  music: "#3D9C6B",
  game: "#B07E55",
  design: "#8C6FA1",
  reading: "#399CCB",
  finance: "#9A8C52",
  utility: "#35A69E",
};
