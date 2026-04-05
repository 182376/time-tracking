import {
  buildCustomCategory,
  getCategoryToken,
  isAppCategory,
  isCustomCategory,
  OTHER_CATEGORY_FIXED_COLOR,
  QUIET_PRO_CATEGORY_PALETTE_37,
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
  track?: boolean;
  captureTitle?: boolean;
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
    category: "ai",
    keywords: ["alma", "chatgpt", "openai", "claude", "anthropic", "gemini", "copilot", "deepseek", "kimi", "qwen", "tongyi", "yuanbao", "ollama", "llm", "aistudio", "anythingllm"],
  },
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

const USER_ASSIGNABLE_CATEGORY_SET = new Set<string>(USER_ASSIGNABLE_CATEGORIES);

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

function normalizeCategoryColorOverrides(
  overrides: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!overrides) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [category, colorValue] of Object.entries(overrides)) {
    if (!isAppCategory(category)) {
      continue;
    }
    const color = normalizeHexColor(colorValue);
    if (!color) {
      continue;
    }
    normalized[category] = color;
  }
  return normalized;
}

function normalizeDefaultColorAssignments(
  assignments: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!assignments) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [category, colorValue] of Object.entries(assignments)) {
    if (!isAppCategory(category) || category === "system" || category === "other") {
      continue;
    }
    const color = normalizeHexColor(colorValue);
    if (!color || !QUIET_PRO_CATEGORY_PALETTE_37.includes(color as (typeof QUIET_PRO_CATEGORY_PALETTE_37)[number])) {
      continue;
    }
    normalized[category] = color;
  }
  return normalized;
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

function normalizeUserAssignableCategory(category: string | undefined): UserAssignableAppCategory | null {
  const normalized = (category ?? "").trim();
  if (!normalized) {
    return null;
  }

  // Backward compatibility for previously introduced fixed "custom" value.
  if (normalized === "custom") {
    return buildCustomCategory("自定义");
  }

  if (isCustomCategory(normalized)) {
    return buildCustomCategory(normalized.slice("custom:".length));
  }

  if (USER_ASSIGNABLE_CATEGORY_SET.has(normalized)) {
    return normalized as UserAssignableAppCategory;
  }

  return null;
}

function normalizeOverride(override: AppOverride | null | undefined): AppOverride | null {
  if (!override) return null;
  if (override.enabled === false) return null;

  const normalized: AppOverride = {};

  const normalizedCategory = normalizeUserAssignableCategory(override.category);
  if (normalizedCategory) {
    normalized.category = normalizedCategory;
  }
  if (override.displayName?.trim()) {
    normalized.displayName = override.displayName.trim();
  }
  const color = normalizeHexColor(override.color);
  if (color) {
    normalized.color = color;
  }
  if (override.track === false) {
    normalized.track = false;
  }
  if (override.captureTitle === false) {
    normalized.captureTitle = false;
  }
  if (typeof override.updatedAt === "number" && Number.isFinite(override.updatedAt)) {
    normalized.updatedAt = override.updatedAt;
  }
  normalized.enabled = true;

  const hasMeaningfulOverride = Boolean(
    normalized.category
    || normalized.displayName
    || normalized.color
    || normalized.track === false
    || normalized.captureTitle === false,
  );

  return hasMeaningfulOverride ? normalized : null;
}

function resolveCategoryColor(category: AppCategory) {
  return ProcessMapper.getCategoryColor(category);
}

export class ProcessMapper {
  private static userOverrides: Record<string, AppOverride> = {};
  private static categoryColorOverrides: Record<string, string> = {};
  private static categoryDefaultColorAssignments: Record<string, string> = {};
  private static persistCategoryDefaultColorAssignment:
    ((category: AppCategory, colorValue: string | null) => Promise<void>) | null = null;
  private static deletedCategories = new Set<AppCategory>();

  static getUserAssignableCategories() {
    return [...USER_ASSIGNABLE_CATEGORIES];
  }

  static setDeletedCategories(categories: AppCategory[]) {
    const nextDeleted = new Set(categories);
    for (const category of Object.keys(this.categoryDefaultColorAssignments)) {
      if (!isAppCategory(category) || category === "system" || category === "other") {
        continue;
      }
      const wasDeleted = this.deletedCategories.has(category);
      const isNowDeleted = nextDeleted.has(category);
      if (!wasDeleted && isNowDeleted) {
        void this.removeCategoryDefaultColorAssignment(category);
      }
    }
    this.deletedCategories = nextDeleted;
  }

  static getDeletedCategories(): AppCategory[] {
    return Array.from(this.deletedCategories);
  }

  static isCategoryDeleted(category: AppCategory): boolean {
    return this.deletedCategories.has(category);
  }

  static getCategoryLabel(category: AppCategory) {
    return getCategoryToken(category).label;
  }

  static getCategoryColor(category: AppCategory) {
    return this.categoryColorOverrides[category] ?? this.getDefaultCategoryColor(category);
  }

  static getDefaultCategoryColor(category: AppCategory) {
    if (category === "system") {
      return getCategoryToken(category).color;
    }

    if (category === "other") {
      return OTHER_CATEGORY_FIXED_COLOR;
    }

    const persisted = this.categoryDefaultColorAssignments[category];
    if (persisted) {
      return persisted;
    }

    const usedColors = new Set<string>();
    for (const [assignedCategory, color] of Object.entries(this.categoryDefaultColorAssignments)) {
      if (!isAppCategory(assignedCategory)) {
        continue;
      }
      if (assignedCategory === "system" || assignedCategory === "other") {
        continue;
      }
      if (this.deletedCategories.has(assignedCategory)) {
        continue;
      }
      usedColors.add(color);
    }

    const availableColors = QUIET_PRO_CATEGORY_PALETTE_37.filter((color) => !usedColors.has(color));
    const palette = availableColors.length > 0 ? availableColors : [...QUIET_PRO_CATEGORY_PALETTE_37];
    const nextColor = palette[Math.floor(Math.random() * palette.length)];

    this.categoryDefaultColorAssignments[category] = nextColor;
    if (this.persistCategoryDefaultColorAssignment) {
      void this.persistCategoryDefaultColorAssignment(category, nextColor).catch((error) => {
        console.warn("Failed to persist category default color assignment", { category, error });
      });
    }

    return nextColor;
  }

  static getCategoryColorOverride(category: AppCategory): string | null {
    return this.categoryColorOverrides[category] ?? null;
  }

  static setCategoryColorOverrides(overrides: Record<string, string>) {
    this.categoryColorOverrides = normalizeCategoryColorOverrides(overrides);
  }

  static setCategoryColorOverride(category: AppCategory, colorValue?: string | null) {
    const color = normalizeHexColor(colorValue ?? undefined);
    if (!color) {
      delete this.categoryColorOverrides[category];
      return;
    }
    this.categoryColorOverrides[category] = color;
  }

  static clearCategoryColorOverrides() {
    this.categoryColorOverrides = {};
  }

  static setCategoryDefaultColorAssignments(assignments: Record<string, string>) {
    this.categoryDefaultColorAssignments = normalizeDefaultColorAssignments(assignments);
  }

  static setCategoryDefaultColorAssignmentPersistence(
    handler: ((category: AppCategory, colorValue: string | null) => Promise<void>) | null,
  ) {
    this.persistCategoryDefaultColorAssignment = handler;
  }

  static async removeCategoryDefaultColorAssignment(category: AppCategory) {
    if (category === "system" || category === "other") {
      return;
    }
    delete this.categoryDefaultColorAssignments[category];
    if (this.persistCategoryDefaultColorAssignment) {
      await this.persistCategoryDefaultColorAssignment(category, null);
    }
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

  private static resolveActiveCategory(category: AppCategory): AppCategory {
    if (!this.deletedCategories.has(category)) {
      return category;
    }

    if (category === "system") {
      return "system";
    }

    const fallback = USER_ASSIGNABLE_CATEGORIES.find((item) => !this.deletedCategories.has(item));
    return (fallback ?? "other") as AppCategory;
  }

  static map(exeName: string, hints: MappingHints = {}): AppInfo {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    const defaultMapping = DEFAULT_APP_MAPPINGS[canonicalExe];
    const override = this.userOverrides[canonicalExe];
    const hasOverride = Boolean(
      override?.category
      || override?.displayName
      || override?.color
      || override?.track === false
      || override?.captureTitle === false,
    );

    if (defaultMapping) {
      const mappedCategory = override?.category ?? defaultMapping.category;
      const category = this.resolveActiveCategory(mappedCategory);
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
    const rawCategory = override?.category ?? categoryByRule ?? "other";
    const resolvedCategory = this.resolveActiveCategory(rawCategory);

    return {
      name: resolvedName,
      category: resolvedCategory,
      color: override?.color ?? resolveCategoryColor(resolvedCategory),
      confidence: override?.category || override?.color || override?.track === false || override?.captureTitle === false
        ? "high"
        : categoryByRule
          ? "medium"
          : "low",
      source: hasOverride ? "override" : categoryByRule ? "heuristic" : "fallback",
    };
  }

  static shouldTrack(exeName: string): boolean {
    const canonicalExe = resolveCanonicalExecutable(exeName);
    if (!shouldTrackProcess(canonicalExe)) {
      return false;
    }

    const override = this.userOverrides[canonicalExe];
    if (override?.track === false) {
      return false;
    }

    return this.map(canonicalExe).category !== "system";
  }

  static toOverrideStorageValue(override: AppOverride) {
    return JSON.stringify({
      category: override.category ?? null,
      displayName: override.displayName ?? null,
      color: normalizeHexColor(override.color) ?? null,
      track: override.track !== false,
      captureTitle: override.captureTitle !== false,
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
      const legacyCategory = normalizeUserAssignableCategory(rawValue.trim());
      if (legacyCategory) {
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
