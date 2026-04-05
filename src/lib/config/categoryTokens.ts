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

const BUILTIN_TOKENS: Record<BuiltinAppCategory, CategoryToken> = {
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
  other: { label: "未分类", color: "#94A3B8" },
  system: { label: "系统", color: "#475569" },
};

const BUILTIN_SET = new Set<string>(Object.keys(BUILTIN_TOKENS));

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const c = (1 - Math.abs((2 * l) - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const m = l - c / 2;
  return `#${toHexByte((r + m) * 255)}${toHexByte((g + m) * 255)}${toHexByte((b + m) * 255)}`.toUpperCase();
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deriveCustomColor(category: CustomAppCategory): string {
  const seed = resolveCustomCategoryLabel(category);
  const hash = hashText(seed);
  const hue = hash % 360;
  const saturation = 0.7 + ((hash >> 8) % 12) / 100;
  const lightness = 0.46 + ((hash >> 16) % 8) / 100;
  return hslToHex(hue, saturation, lightness);
}

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
  if (isCustomCategory(category)) {
    return {
      label: resolveCustomCategoryLabel(category),
      color: deriveCustomColor(category),
    };
  }
  return BUILTIN_TOKENS[category];
}
