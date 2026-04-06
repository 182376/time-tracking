// Legacy compatibility barrel.
// New feature logic should depend on `settings-store` / `classification-store`
// or shared persistence adapters.
export type {
  AppSettings,
  CloseBehavior,
  MinimizeBehavior,
} from "./settings-store";

export {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSetting,
  clearSessionsBefore,
  clearAllWindowTitles,
  loadTrackerHealthTimestamp,
  saveTrackerHeartbeat,
} from "./settings-store";

export type {
  OtherCategoryCandidate,
  ObservedAppCandidate,
} from "./classification-store";

export {
  loadAppOverrides,
  saveAppOverride,
  clearAllAppOverrides,
  loadCategoryColorOverrides,
  saveCategoryColorOverride,
  clearAllCategoryColorOverrides,
  loadCategoryDefaultColorAssignments,
  saveCategoryDefaultColorAssignment,
  loadCustomCategories,
  saveCustomCategory,
  deleteCustomCategory,
  loadDeletedCategories,
  saveDeletedCategory,
  loadOtherCategoryCandidates,
  loadObservedAppCandidates,
  deleteObservedAppSessions,
} from "./classification-store";
