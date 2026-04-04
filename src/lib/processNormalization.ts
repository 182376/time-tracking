import { DEFAULT_APP_MAPPINGS } from "./config/defaultMappings.ts";

const DERIVED_ALIAS_SUFFIXES = [
  "webhelper",
  "helper",
  "widget",
  "tray",
];

const NON_TRACKABLE_EXE_NAMES = new Set([
  "",
  "time_tracker.exe",
  "searchhost.exe",
  "searchapp.exe",
  "searchindexer.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "applicationframehost.exe",
  "textinputhost.exe",
  "runtimebroker.exe",
  "taskhostw.exe",
  "consent.exe",
  "lockapp.exe",
  "logonui.exe",
  "sihost.exe",
  "dwm.exe",
  "ctfmon.exe",
  "fontdrvhost.exe",
  "securityhealthsystray.exe",
  "smartscreen.exe",
  "winlogon.exe",
  "userinit.exe",
  "pickerhost.exe",
  "pickerhost",
]);

export function normalizeExecutable(exeName: string) {
  return exeName.trim().toLowerCase().replace(/^"+|"+$/g, "");
}

function stripExeSuffix(exeName: string) {
  return exeName.endsWith(".exe") ? exeName.slice(0, -4) : exeName;
}

function resolveDerivedAliasExecutable(normalizedExe: string) {
  const stem = stripExeSuffix(normalizedExe);
  if (!stem) return null;

  for (const suffix of DERIVED_ALIAS_SUFFIXES) {
    if (!stem.endsWith(suffix) || stem === suffix) {
      continue;
    }

    const baseStem = stem.slice(0, -suffix.length).replace(/[_\-.]+$/g, "");
    if (!baseStem) {
      continue;
    }

    const candidateExe = `${baseStem}.exe`;
    if (DEFAULT_APP_MAPPINGS[candidateExe]) {
      return candidateExe;
    }
  }

  return null;
}

export function resolveCanonicalExecutable(exeName: string) {
  const normalized = normalizeExecutable(exeName);
  const derivedAlias = resolveDerivedAliasExecutable(normalized);
  if (derivedAlias) {
    return derivedAlias;
  }

  return normalized;
}

export function resolveCanonicalDisplayName(exeName: string) {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  return DEFAULT_APP_MAPPINGS[canonicalExe]?.name;
}

export function shouldTrackProcess(exeName: string) {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  if (!canonicalExe) return false;
  if (NON_TRACKABLE_EXE_NAMES.has(canonicalExe)) return false;

  if (canonicalExe.endsWith(".exe")) {
    const withoutExe = canonicalExe.slice(0, -4);
    if (NON_TRACKABLE_EXE_NAMES.has(withoutExe)) {
      return false;
    }
  }

  return true;
}
