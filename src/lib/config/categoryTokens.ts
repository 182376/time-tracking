export const CUSTOM_CATEGORY_PREFIX = "custom:" as const;

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
  | "other"
  | "system";

export type CustomAppCategory = `${typeof CUSTOM_CATEGORY_PREFIX}${string}`;
export type AppCategory = BuiltinAppCategory | CustomAppCategory;
export type UserAssignableAppCategory = Exclude<AppCategory, "system">;

export const USER_ASSIGNABLE_CATEGORIES: UserAssignableAppCategory[] = [
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

interface CategoryToken {
  label: string;
  color: string;
}

export const QUIET_PRO_CATEGORY_PALETTE_37 = [
  "#4F5FD7",
  "#5968DE",
  "#6471E3",
  "#6F7AE6",
  "#4B78C8",
  "#5380CD",
  "#5D88D1",
  "#3F86C9",
  "#4790CF",
  "#3293C8",
  "#399CCB",
  "#2E9FAE",
  "#35A69E",
  "#2FA58B",
  "#36AC7E",
  "#3D9C6B",
  "#46956F",
  "#4F987F",
  "#5A9861",
  "#66955C",
  "#7C945C",
  "#8A9058",
  "#9A8C52",
  "#AA8752",
  "#B07E55",
  "#B97A58",
  "#C07158",
  "#C56A73",
  "#BE657D",
  "#B6688B",
  "#A06A7D",
  "#976C90",
  "#8C6FA1",
  "#8572A5",
  "#7E74A8",
  "#6F7F92",
  "#637D9F",
] as const;

export const OTHER_CATEGORY_FIXED_COLOR = "#8F98A8";

const BUILTIN_LABELS: Record<BuiltinAppCategory, string> = {
  ai: "AI",
  development: "开发",
  office: "办公",
  browser: "浏览",
  communication: "通讯",
  meeting: "会议",
  video: "视频",
  music: "音乐",
  game: "游戏",
  design: "设计",
  reading: "阅读",
  finance: "金融",
  utility: "工具",
  other: "未分类",
  system: "系统",
};

const SYSTEM_TOKEN: CategoryToken = { label: "系统", color: "#475569" };
const BUILTIN_SET = new Set<string>(Object.keys(BUILTIN_LABELS));

function normalizeCustomCategoryLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "自定义";
  }
  return trimmed.slice(0, 20);
}

export function resolveCustomCategoryLabel(category: CustomAppCategory): string {
  const raw = category.slice(CUSTOM_CATEGORY_PREFIX.length);
  if (!raw) {
    return "自定义";
  }
  try {
    return normalizeCustomCategoryLabel(decodeURIComponent(raw));
  } catch {
    return normalizeCustomCategoryLabel(raw);
  }
}

export function buildCustomCategory(label: string): CustomAppCategory {
  const normalizedLabel = normalizeCustomCategoryLabel(label);
  const encodedLabel = encodeURIComponent(normalizedLabel);
  return `${CUSTOM_CATEGORY_PREFIX}${encodedLabel}` as CustomAppCategory;
}

export function isCustomCategory(category: string): category is CustomAppCategory {
  return category.startsWith(CUSTOM_CATEGORY_PREFIX) && category.length > CUSTOM_CATEGORY_PREFIX.length;
}

export function isBuiltinCategory(category: string): category is BuiltinAppCategory {
  return BUILTIN_SET.has(category);
}

export function isAppCategory(category: string): category is AppCategory {
  return isBuiltinCategory(category) || isCustomCategory(category);
}

export function getCategoryToken(category: AppCategory): CategoryToken {
  if (category === "system") {
    return SYSTEM_TOKEN;
  }

  if (category === "other") {
    return {
      label: BUILTIN_LABELS.other,
      color: OTHER_CATEGORY_FIXED_COLOR,
    };
  }

  if (isCustomCategory(category)) {
    return {
      label: resolveCustomCategoryLabel(category),
      color: QUIET_PRO_CATEGORY_PALETTE_37[0],
    };
  }

  return {
    label: BUILTIN_LABELS[category],
    color: QUIET_PRO_CATEGORY_PALETTE_37[0],
  };
}
