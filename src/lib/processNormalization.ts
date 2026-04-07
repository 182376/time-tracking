import { DEFAULT_APP_MAPPINGS } from "./config/defaultMappings.ts";

const DERIVED_ALIAS_SUFFIXES = [
  "webhelper",
  "helper",
  "widget",
  "tray",
];

const LIFECYCLE_ALIAS_MARKERS = [
  "uninstaller",
  "uninstall",
  "installer",
  "install",
  "updater",
  "update",
  "setup",
  "upgrade",
  "unins000",
  "unins",
  "remove",
  "maintenancetool",
  "maintenance",
];

const LIFECYCLE_ALIAS_MARKER_SET = new Set(LIFECYCLE_ALIAS_MARKERS);
const LIFECYCLE_ALIAS_NOISE_TOKENS = new Set([
  ...LIFECYCLE_ALIAS_MARKERS,
  "win",
  "windows",
  "x64",
  "x86",
  "amd64",
  "arm64",
  "ia32",
  "portable",
  "release",
  "latest",
  "beta",
  "alpha",
  "nightly",
  "stable",
  "desktop",
  "app",
]);

const LIFECYCLE_ALIAS_PATTERN = LIFECYCLE_ALIAS_MARKERS.join("|");

const NON_TRACKABLE_EXE_NAMES = new Set([
  "",
  "time_tracker.exe",
  "time_tracker",
  "time-tracker.exe",
  "time-tracker",
  "timetracker.exe",
  "timetracker",
  "time tracker.exe",
  "time tracker",
  "uninstall.exe",
  "uninstall",
  "unins000.exe",
  "unins000",
  "unins.exe",
  "unins",
]);

// Keep a tiny frontend read-model guard so historical rows containing known
// Windows shell/system hosts do not reappear in user-facing stats.
const READ_MODEL_BLOCKED_EXE_NAMES = new Set([
  "pickerhost.exe",
  "pickerhost",
]);

export function normalizeExecutable(exeName: string) {
  return exeName.trim().toLowerCase().replace(/^"+|"+$/g, "");
}

function stripExeSuffix(exeName: string) {
  return exeName.endsWith(".exe") ? exeName.slice(0, -4) : exeName;
}

function isVersionLikeToken(token: string) {
  return /^\d+$/.test(token) || /^v?\d+(?:\.\d+){1,5}$/.test(token);
}

function sanitizeAliasBaseStem(rawStem: string) {
  const trimmed = rawStem.replace(/^[_\-. ]+|[_\-. ]+$/g, "");
  if (!trimmed) {
    return null;
  }

  const tokens = trimmed.split(/[_\-. ]+/).filter(Boolean);
  const baseTokens = tokens.filter((token) => (
    !LIFECYCLE_ALIAS_NOISE_TOKENS.has(token)
    && !isVersionLikeToken(token)
  ));

  if (baseTokens.length === 0) {
    return null;
  }

  const candidate = baseTokens.join("-");
  if (candidate.length < 2 || !/[a-z]/.test(candidate)) {
    return null;
  }

  return candidate;
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

function resolveLifecycleAliasExecutable(normalizedExe: string) {
  const stem = stripExeSuffix(normalizedExe);
  if (!stem) return null;

  const suffixMatch = stem.match(new RegExp(
    `^(.+?)[_\\-. ](?:${LIFECYCLE_ALIAS_PATTERN})(?:[_\\-. ].*)?$`,
  ));
  if (suffixMatch?.[1]) {
    const baseStem = sanitizeAliasBaseStem(suffixMatch[1]);
    if (baseStem) {
      return `${baseStem}.exe`;
    }
  }

  const prefixMatch = stem.match(new RegExp(`^(?:${LIFECYCLE_ALIAS_PATTERN})[_\\-. ](.+)$`));
  if (prefixMatch?.[1]) {
    const baseStem = sanitizeAliasBaseStem(prefixMatch[1]);
    if (baseStem) {
      return `${baseStem}.exe`;
    }
  }

  const tokens = stem.split(/[_\-. ]+/).filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const hasVersion = tokens.some(isVersionLikeToken);
  const hasLifecycleMarker = tokens.some((token) => LIFECYCLE_ALIAS_MARKER_SET.has(token));
  const hasBuildContext = tokens.some((token) => LIFECYCLE_ALIAS_NOISE_TOKENS.has(token));

  if (hasVersion && (hasLifecycleMarker || hasBuildContext)) {
    const baseStem = sanitizeAliasBaseStem(tokens[0]);
    if (baseStem) {
      return `${baseStem}.exe`;
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

  const lifecycleAlias = resolveLifecycleAliasExecutable(normalized);
  if (lifecycleAlias) {
    return lifecycleAlias;
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
  if (READ_MODEL_BLOCKED_EXE_NAMES.has(canonicalExe)) return false;

  if (canonicalExe.endsWith(".exe")) {
    const withoutExe = canonicalExe.slice(0, -4);
    if (NON_TRACKABLE_EXE_NAMES.has(withoutExe)) {
      return false;
    }
    if (READ_MODEL_BLOCKED_EXE_NAMES.has(withoutExe)) {
      return false;
    }
  }

  // Runtime filtering in Rust remains the source of truth for live tracking.
  // Frontend only keeps this minimal guard for historical data safety.
  return true;
}
