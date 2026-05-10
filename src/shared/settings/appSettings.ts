import { RELEASE_DEFAULT_SETTINGS } from "./releaseDefaultProfile.ts";

export type CloseBehavior = "exit" | "tray";
export type MinimizeBehavior = "taskbar" | "widget";
export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme =
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

export interface AppSettings {
  idleTimeoutSecs: number;
  timelineMergeGapSecs: number;
  refreshIntervalSecs: number;
  minSessionSecs: number;
  trackingPaused: boolean;
  closeBehavior: CloseBehavior;
  minimizeBehavior: MinimizeBehavior;
  themeMode: ThemeMode;
  colorSchemeLight: ColorScheme;
  colorSchemeDark: ColorScheme;
  launchAtLogin: boolean;
  startMinimized: boolean;
  onboardingCompleted: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ...RELEASE_DEFAULT_SETTINGS,
};
