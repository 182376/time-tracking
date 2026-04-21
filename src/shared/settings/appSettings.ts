import { RELEASE_DEFAULT_SETTINGS } from "./releaseDefaultProfile.ts";

export type CloseBehavior = "exit" | "tray";
export type MinimizeBehavior = "taskbar" | "widget";

export interface AppSettings {
  idle_timeout_secs: number;
  timeline_merge_gap_secs: number;
  refresh_interval_secs: number;
  min_session_secs: number;
  tracking_paused: boolean;
  close_behavior: CloseBehavior;
  minimize_behavior: MinimizeBehavior;
  launch_at_login: boolean;
  start_minimized: boolean;
  onboarding_completed: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ...RELEASE_DEFAULT_SETTINGS,
};

const IDLE_TIMEOUT_SECONDS_RANGE = { min: 300, max: 1800, step: 60 } as const;
const TIMELINE_MERGE_GAP_SECONDS_RANGE = { min: 60, max: 300, step: 60 } as const;
const REFRESH_INTERVAL_OPTIONS = [1, 3];
const MIN_SESSION_SECONDS_RANGE = { min: 60, max: 600, step: 60 } as const;
const CLOSE_BEHAVIOR_OPTIONS: CloseBehavior[] = ["exit", "tray"];
const MINIMIZE_BEHAVIOR_OPTIONS: MinimizeBehavior[] = ["taskbar", "widget"];

function parseNumberSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionValue(value: string | undefined, fallback: number, allowedValues: number[]) {
  const parsed = parseNumberSetting(value, fallback);
  return allowedValues.includes(parsed) ? parsed : fallback;
}

function normalizeRangeStepValue(
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number; step: number },
) {
  const parsed = parseNumberSetting(value, fallback);
  const clamped = Math.min(range.max, Math.max(range.min, parsed));
  return Math.round(clamped / range.step) * range.step;
}

function parseBooleanSetting(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeEnumOption<T extends string>(
  value: string | undefined,
  fallback: T,
  allowedValues: readonly T[],
) {
  if (!value) return fallback;
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

export function serializeSettingValue(value: AppSettings[keyof AppSettings]) {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

export function normalizeSettingsRecord(record: Record<string, string | undefined>): AppSettings {
  return {
    idle_timeout_secs: normalizeRangeStepValue(
      record.idle_timeout_secs,
      DEFAULT_SETTINGS.idle_timeout_secs,
      IDLE_TIMEOUT_SECONDS_RANGE,
    ),
    timeline_merge_gap_secs: normalizeRangeStepValue(
      record.timeline_merge_gap_secs,
      DEFAULT_SETTINGS.timeline_merge_gap_secs,
      TIMELINE_MERGE_GAP_SECONDS_RANGE,
    ),
    refresh_interval_secs: normalizeOptionValue(
      record.refresh_interval_secs,
      DEFAULT_SETTINGS.refresh_interval_secs,
      REFRESH_INTERVAL_OPTIONS,
    ),
    min_session_secs: normalizeRangeStepValue(
      record.min_session_secs,
      DEFAULT_SETTINGS.min_session_secs,
      MIN_SESSION_SECONDS_RANGE,
    ),
    tracking_paused: parseBooleanSetting(record.tracking_paused, DEFAULT_SETTINGS.tracking_paused),
    close_behavior: normalizeEnumOption(
      record.close_behavior,
      DEFAULT_SETTINGS.close_behavior,
      CLOSE_BEHAVIOR_OPTIONS,
    ),
    minimize_behavior: normalizeEnumOption(
      record.minimize_behavior,
      DEFAULT_SETTINGS.minimize_behavior,
      MINIMIZE_BEHAVIOR_OPTIONS,
    ),
    launch_at_login: parseBooleanSetting(record.launch_at_login, DEFAULT_SETTINGS.launch_at_login),
    start_minimized: parseBooleanSetting(record.start_minimized, DEFAULT_SETTINGS.start_minimized),
    onboarding_completed: parseBooleanSetting(
      record.onboarding_completed,
      DEFAULT_SETTINGS.onboarding_completed,
    ),
  };
}
