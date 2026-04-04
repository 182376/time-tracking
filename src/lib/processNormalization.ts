const CANONICAL_EXE_ALIASES: Record<string, string> = {
  "douyin_widget.exe": "douyin.exe",
  "douyin_widget": "douyin.exe",
  "douyinwidget.exe": "douyin.exe",
  "douyinwidget": "douyin.exe",
  "douyin_tray.exe": "douyin.exe",
  "douyin_tray": "douyin.exe",
  "douyintray.exe": "douyin.exe",
  "douyintray": "douyin.exe",
};

const CANONICAL_DISPLAY_NAMES: Record<string, string> = {
  "douyin.exe": "抖音",
};

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

export function resolveCanonicalExecutable(exeName: string) {
  const normalized = normalizeExecutable(exeName);
  return CANONICAL_EXE_ALIASES[normalized] ?? normalized;
}

export function resolveCanonicalDisplayName(exeName: string) {
  const canonicalExe = resolveCanonicalExecutable(exeName);
  return CANONICAL_DISPLAY_NAMES[canonicalExe];
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
