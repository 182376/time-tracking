import {
  getCategoryToken,
  USER_ASSIGNABLE_CATEGORIES,
  type AppCategory,
  type UserAssignableAppCategory,
} from "./config/categoryTokens.ts";
import { DEFAULT_APP_MAPPINGS } from "./config/defaultMappings.ts";
import { resolveCanonicalExecutable, shouldTrackProcess } from "./processNormalization.ts";

export type MappingConfidence = "high" | "medium" | "low";

export interface MappingHints {
  appName?: string;
  processPath?: string;
}

export interface AppOverride {
  category?: UserAssignableAppCategory;
  displayName?: string;
  color?: string;
  enabled?: boolean;
  updatedAt?: number;
}

export interface AppInfo {
  name: string;
  category: AppCategory;
  color: string;
  confidence: MappingConfidence;
  source: "default" | "override" | "heuristic" | "fallback";
}

const CATEGORY_BY_KEYWORD: Array<{
  category: AppCategory;
  keywords: string[];
}> = [
  {
    category: "development",
    keywords: ["vscode", "vscodium", "cursor", "idea", "goland", "pycharm", "webstorm", "clion", "rider", "dev", "code"],
  },
  {
    category: "office",
    keywords: ["office", "word", "excel", "powerpoint", "wps", "onenote", "calendar", "outlook"],
  },
  {
    category: "browser",
    keywords: ["chrome", "edge", "firefox", "browser", "safari", "vivaldi", "opera", "brave", "arc"],
  },
  {
    category: "communication",
    keywords: ["wechat", "weixin", "qq", "telegram", "discord", "slack", "lark", "dingtalk"],
  },
  {
    category: "meeting",
    keywords: ["zoom", "teams", "meeting", "voov", "tencent meeting"],
  },
  {
    category: "video",
    keywords: ["douyin", "bilibili", "youtube", "netflix", "player", "video"],
  },
  {
    category: "music",
    keywords: ["spotify", "music", "netease", "qqmusic"],
  },
  {
    category: "game",
    keywords: ["steam", "epic", "hoyoplay", "mihoyo", "genshin", "star rail", "valorant", "league", "game"],
  },
  {
    category: "design",
    keywords: ["figma", "sketch", "photoshop", "illustrator", "after effects", "adobe xd", "canva"],
  },
  {
    category: "reading",
    keywords: ["obsidian", "zotero", "typora", "reader", "pdf", "kindle", "book"],
  },
  {
    category: "finance",
    keywords: ["trader", "bank", "finance", "stock", "binance", "okx", "huobi"],
  },
  {
    category: "utility",
    keywords: ["todesk", "teamviewer", "anydesk", "terminal", "flash", "snip", "screenshot", "tool", "utility"],
  },
];

const USER_ASSIGNABLE_CATEGORY_SET = new Set<UserAssignableAppCategory>(USER_ASSIGNABLE_CATEGORIES);

function formatFallbackName(exeName: string) {
  return exeName
    .replace(/\.exe$/i, "")
    .split(/[_\-\s.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDisplayName(name: string | undefined) {
  return (name ?? "").trim().replace(/\.exe$/i, "");
}

function normalizeHexColor(color: string | undefined): string | null {
  const raw = (color ?? "").trim();
  if (!raw) return null;

  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null;
  }

  return normalized.toUpperCase();
}

function buildSearchText(canonicalExe: string, hints: MappingHints) {
  return [
    canonicalExe,
    normalizeDisplayName(hints.appName),
    normalizeDisplayName(hints.processPath),
  ]
    .join(" ")
    .toLowerCase();
}

function classifyByKeywords(canonicalExe: string, hints: MappingHints): AppCategory | null {
  const searchText = buildSearchText(canonicalExe, hints);

  for (const rule of CATEGORY_BY_KEYWORD) {
    if (rule.keywords.some((keyword) => searchText.includes(keyword))) {
      return rule.category;
    }
  }

  return null;
}

function normalizeOverride(override: AppOverride | null | undefined): AppOverride | null {
  if (!override) return null;
  if (override.enabled === false) return null;

  const normalized: AppOverride = {};

  if (override.category && USER_ASSIGNABLE_CATEGORY_SET.has(override.category)) {
    normalized.category = override.category;
  }
  if (override.displayName?.trim()) {
    normalized.displayName = override.displayName.trim();
  }
  const color = normalizeHexColor(override.color);
  if (color) {
    normalized.color = color;
  }
  if (typeof override.updatedAt === "number" && Number.isFinite(override.updatedAt)) {
    normalized.updatedAt = override.updatedAt;
  }
  normalized.enabled = true;

  return Object.keys(normalized).length > 1 ? normalized : null;
}

function resolveCategoryColor(category: AppCategory) {
  return getCategoryToken(category).color;
}

export class ProcessMapper {
  private static userOverrides: Record<string, AppOverride> = {};

  static getUserAssignableCategories() {
    return [...USER_ASSIGNABLE_CATEGORIES];
  }

  static getCategoryLabel(category: AppCategory) {
    return getCategoryToken(category).label;
  }

  static getCategoryColor(category: AppCategory) {
    return resolveCategoryColor(category);
  }

  static setUserOverrides(overrides: Record<string, AppOverride>) {
    const normalized: Record<string, AppOverride> = {};
    for (const [exeName, override] of Object.entries(overrides)) {
      const canonicalExe = resolveCanonicalExecutable(exeName);
      if (!canonicalExe) continue;

      const safeOverride = normalizeOverride(override);
      if (!safeOverride) continue;
      normalized[canonicalExe] = safeOverride;
    }
    this.userOverrides = normalized;
  }

  static setUserOverride(exeName: string, override: AppOverride | null) {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    if (!canonicalExe) return;

    const safeOverride = normalizeOverride(override);
    if (!safeOverride) {
      delete this.userOverrides[canonicalExe];
      return;
    }

    this.userOverrides[canonicalExe] = safeOverride;
  }

  static clearUserOverrides() {
    this.userOverrides = {};
  }

  static getUserOverride(exeName: string): AppOverride | null {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    return this.userOverrides[canonicalExe] ?? null;
  }

  static map(exeName: string, hints: MappingHints = {}): AppInfo {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    const defaultMapping = DEFAULT_APP_MAPPINGS[canonicalExe];
    const override = this.userOverrides[canonicalExe];
    const hasOverride = Boolean(override?.category || override?.displayName || override?.color);

    if (defaultMapping) {
      const category = override?.category ?? defaultMapping.category;
      const name = override?.displayName || normalizeDisplayName(hints.appName) || defaultMapping.name;
      return {
        name,
        category,
        color: override?.color ?? resolveCategoryColor(category),
        confidence: "high",
        source: hasOverride ? "override" : "default",
      };
    }

    const categoryByRule = classifyByKeywords(canonicalExe, hints);
    const fallbackName = formatFallbackName(canonicalExe) || canonicalExe;
    const resolvedName = override?.displayName || normalizeDisplayName(hints.appName) || fallbackName;
    const resolvedCategory = override?.category ?? categoryByRule ?? "other";

    return {
      name: resolvedName,
      category: resolvedCategory,
      color: override?.color ?? resolveCategoryColor(resolvedCategory),
      confidence: override?.category || override?.color ? "high" : categoryByRule ? "medium" : "low",
      source: hasOverride ? "override" : categoryByRule ? "heuristic" : "fallback",
    };
  }

  static shouldTrack(exeName: string): boolean {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    if (!shouldTrackProcess(canonicalExe)) {
      return false;
    }

    return this.map(canonicalExe).category !== "system";
  }

  static toOverrideStorageValue(override: AppOverride) {
    return JSON.stringify({
      category: override.category ?? null,
      displayName: override.displayName ?? null,
      color: normalizeHexColor(override.color) ?? null,
      enabled: override.enabled !== false,
      updatedAt: override.updatedAt ?? Date.now(),
    });
  }

  static fromOverrideStorageValue(rawValue: string): AppOverride | null {
    if (!rawValue.trim()) return null;
    try {
      const parsed = JSON.parse(rawValue) as AppOverride;
      return normalizeOverride(parsed);
    } catch {
      const legacyCategory = rawValue.trim() as UserAssignableAppCategory;
      if (USER_ASSIGNABLE_CATEGORY_SET.has(legacyCategory)) {
        return normalizeOverride({
          category: legacyCategory,
          enabled: true,
          updatedAt: Date.now(),
        });
      }
      return null;
    }
  }
}
