export interface ReleaseDefaultSettingsProfile {
  idleTimeoutSecs: number;
  timelineMergeGapSecs: number;
  refreshIntervalSecs: number;
  minSessionSecs: number;
  trackingPaused: boolean;
  closeBehavior: "exit" | "tray";
  minimizeBehavior: "taskbar" | "widget";
  themeMode: "light" | "dark" | "system";
  colorSchemeLight:
    | "default"
    | "ayu"
    | "catppuccin"
    | "dracula"
    | "everforest"
    | "flexoki"
    | "github"
    | "gruvbox"
    | "kanagawa"
    | "material"
    | "nord"
    | "one"
    | "rose-pine"
    | "solarized"
    | "tokyo-night"
    | "vitesse";
  colorSchemeDark:
    | "default"
    | "ayu"
    | "catppuccin"
    | "dracula"
    | "everforest"
    | "flexoki"
    | "github"
    | "gruvbox"
    | "kanagawa"
    | "material"
    | "nord"
    | "one"
    | "rose-pine"
    | "solarized"
    | "tokyo-night"
    | "vitesse";
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
  closeBehavior: "tray",
  minimizeBehavior: "widget",
  themeMode: "light",
  colorSchemeLight: "default",
  colorSchemeDark: "default",
  launchAtLogin: true,
  startMinimized: true,
  onboardingCompleted: true,
};
