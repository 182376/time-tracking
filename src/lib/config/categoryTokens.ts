export const CUSTOM_CATEGORY_PREFIX = "custom:" as const;
const CUSTOM_CATEGORY_DEFAULT_LABEL = "自定义";
const CUSTOM_CATEGORY_COLOR = "#A855F7";

export type CustomAppCategory = `${typeof CUSTOM_CATEGORY_PREFIX}${string}`;

export type BuiltinAppCategory =
  | "ai"
  | "development"
  | "office"
  | "browser"
  | "communication"
  | "meeting"
  | "video"
  | "music"
  | "game"
  | "design"
  | "reading"
  | "finance"
  | "utility"
  | "system"
  | "other";

export type AppCategory = BuiltinAppCategory | CustomAppCategory;
export type UserAssignableAppCategory = Exclude<BuiltinAppCategory, "system"> | CustomAppCategory;

export interface CategoryToken {
  label: string;
  color: string;
}

const BUILTIN_CATEGORY_TOKENS: Record<BuiltinAppCategory, CategoryToken> = {
  ai: { label: "AI", color: "#06B6D4" },
  development: { label: "开发", color: "#4F46E5" },
  office: { label: "办公", color: "#0EA5E9" },
  browser: { label: "浏览", color: "#3B82F6" },
  communication: { label: "通讯", color: "#10B981" },
  meeting: { label: "会议", color: "#14B8A6" },
  video: { label: "视频", color: "#EC4899" },
  music: { label: "音乐", color: "#F59E0B" },
  game: { label: "游戏", color: "#F97316" },
  design: { label: "设计", color: "#8B5CF6" },
  reading: { label: "阅读", color: "#6366F1" },
  finance: { label: "金融", color: "#22C55E" },
  utility: { label: "工具", color: "#64748B" },
  system: { label: "系统", color: "#94A3B8" },
  other: { label: "其他", color: "#94A3B8" },
};

export const USER_ASSIGNABLE_CATEGORIES: Exclude<BuiltinAppCategory, "system">[] = [
  "ai",
  "development",
  "office",
  "browser",
  "communication",
  "meeting",
  "video",
  "music",
  "game",
  "design",
  "reading",
  "finance",
  "utility",
  "other",
];

function normalizeCustomCategoryLabel(label: string) {
  const normalized = label.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return CUSTOM_CATEGORY_DEFAULT_LABEL;
  }

  return normalized.slice(0, 4);
}

export function isCustomCategory(category: string): category is CustomAppCategory {
  return category.startsWith(CUSTOM_CATEGORY_PREFIX);
}

export function resolveCustomCategoryLabel(category: string) {
  if (!isCustomCategory(category)) {
    return "";
  }

  return normalizeCustomCategoryLabel(category.slice(CUSTOM_CATEGORY_PREFIX.length));
}

export function buildCustomCategory(label: string): CustomAppCategory {
  return `${CUSTOM_CATEGORY_PREFIX}${normalizeCustomCategoryLabel(label)}`;
}

export function getCategoryToken(category: AppCategory): CategoryToken {
  if (isCustomCategory(category)) {
    return {
      label: resolveCustomCategoryLabel(category),
      color: CUSTOM_CATEGORY_COLOR,
    };
  }

  return BUILTIN_CATEGORY_TOKENS[category];
}
