export type AppCategory =
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

export type UserAssignableAppCategory = Exclude<AppCategory, "system">;

export interface CategoryToken {
  label: string;
  color: string;
}

export const CATEGORY_TOKENS: Record<AppCategory, CategoryToken> = {
  development: { label: "开发编码", color: "#4F46E5" },
  office: { label: "办公协作", color: "#0EA5E9" },
  browser: { label: "浏览阅读", color: "#3B82F6" },
  communication: { label: "即时通讯", color: "#10B981" },
  meeting: { label: "会议语音", color: "#14B8A6" },
  video: { label: "视频内容", color: "#EC4899" },
  music: { label: "音乐音频", color: "#F59E0B" },
  game: { label: "游戏", color: "#F97316" },
  design: { label: "设计创作", color: "#8B5CF6" },
  reading: { label: "阅读研究", color: "#6366F1" },
  finance: { label: "金融交易", color: "#22C55E" },
  utility: { label: "工具效率", color: "#64748B" },
  system: { label: "系统工具", color: "#94A3B8" },
  other: { label: "其他应用", color: "#94A3B8" },
};

export const USER_ASSIGNABLE_CATEGORIES: UserAssignableAppCategory[] = [
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

export function getCategoryToken(category: AppCategory) {
  return CATEGORY_TOKENS[category];
}
