/**
 * A standalone heuristics-based title cleaner that removes common
 * browser/IDE suffixes and statuses without relying on external dictionaries.
 */

export function cleanWindowTitle(title: string, exeName: string): string {
  if (!title) return "";

  let cleaned = title.trim();

  cleaned = cleaned
    .replace(/\s*-\s*未跟踪/u, "")
    .replace(/\s*-\s*已修改/u, "")
    .replace(/\s*[●•]/u, "")
    .replace(/\s*-\s*Visual\s+Studio\s+Code$/ui, "");

  const browserSuffixes = [
    / - Google Chrome$/i,
    / - Microsoft Edge$/i,
    / - Mozilla Firefox$/i,
    / - Arc$/i,
    / - Safari$/i,
    / - Brave$/i,
  ];

  for (const regex of browserSuffixes) {
    cleaned = cleaned.replace(regex, "");
  }

  const lowerExe = exeName.toLowerCase();

  if (
    lowerExe === "antigravity.exe" ||
    lowerExe === "code.exe" ||
    lowerExe === "webstorm.exe" ||
    lowerExe === "cursor.exe"
  ) {
    const parts = cleaned.split(" - ").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts[parts.length - 1];
    }
  }

  return cleaned.trim();
}
