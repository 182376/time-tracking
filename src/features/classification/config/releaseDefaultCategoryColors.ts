import type { UserAssignableAppCategory } from "./categoryTokens";

type BuiltinAssignableCategoryForDefaultColor = Exclude<UserAssignableAppCategory, "other">;

export const RELEASE_DEFAULT_CATEGORY_COLOR_ASSIGNMENTS: Record<
  BuiltinAssignableCategoryForDefaultColor,
  string
> = {
  ai: "#3293C8",
  development: "#4790CF",
  office: "#6F7AE6",
  browser: "#36AC7E",
  communication: "#C56A73",
  meeting: "#BE657D",
  video: "#66955C",
  music: "#3D9C6B",
  game: "#B07E55",
  design: "#8C6FA1",
  reading: "#399CCB",
  finance: "#9A8C52",
  utility: "#35A69E",
};
