/**
 * A standalone heuristics-based title cleaner that removes common
 * browser/IDE suffixes and statuses without relying on external dictionaries.
 */

export function cleanWindowTitle(title: string, exeName: string): string {
  if (!title) return "";

  let cleaned = title.trim();

  // Remove common VS Code statuses
  cleaned = cleaned
    .replace(/\s*-\s*未跟踪$/u, "")
    .replace(/\s*-\s*已修改$/u, "")
    .replace(/\s*●$/u, "")
    .replace(/\s*-\s*Visual\s+Studio\s+Code$/ui, "");

  // Remove common browser suffixes
  const browserSuffixes = [
    / - Google Chrome$/i,
    / - Microsoft​ Edge$/i,
    / - Mozilla Firefox$/i,
    / - Arc$/i,
    / - Safari$/i,
    / - Brave$/i,
  ];

  for (const regex of browserSuffixes) {
    cleaned = cleaned.replace(regex, "");
  }

  // Handle specific applications using native splits if they have standard formatting
  const lowerExe = exeName.toLowerCase();
  
  // IDEs usually have "file - ProjectName - IDE"
  // If we find an IDE, often the right-most portion is the app,
  // before the app is the workspace/project name, and before that is the file.
  if (
    lowerExe === "antigravity.exe" ||
    lowerExe === "code.exe" ||
    lowerExe === "webstorm.exe" ||
    lowerExe === "cursor.exe"
  ) {
    const parts = cleaned.split(" - ").map((p) => p.trim()).filter(Boolean);
    // Usually the last part before "Visual Studio Code" is the project name
    if (parts.length > 1) {
      // Pick the last meaningful element as the "Project" context
      return parts[parts.length - 1];
    }
  }

  return cleaned.trim();
}
