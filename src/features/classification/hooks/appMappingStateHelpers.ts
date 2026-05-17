import type { CandidateFilter, ObservedAppCandidate } from "../types.ts";
import type { UserAssignableAppCategory } from "../../../shared/classification/categoryTokens.ts";
import type { AppOverride } from "../services/classificationService.ts";
import { getUiLocale } from "../../../shared/copy/uiText.ts";
import {
  cloneClassificationDraftState,
  type ClassificationDraftState,
} from "../services/classificationDraftState.ts";

export const AUTO_CATEGORY_VALUE = "__auto__";

function createAppMappingCollator() {
  return new Intl.Collator(getUiLocale(), {
    numeric: true,
    sensitivity: "base",
  });
}

type AppMappingOverrideParams = {
  category?: UserAssignableAppCategory;
  displayName?: string;
  color?: string;
  track?: boolean;
  captureTitle?: boolean;
  updatedAt?: number;
};

type FilterAndSortCandidatesParams = {
  candidates: ObservedAppCandidate[];
  filter: CandidateFilter;
  searchQuery?: string;
  resolveMappedCategory: (candidate: ObservedAppCandidate) => UserAssignableAppCategory;
  resolveEffectiveDisplayName: (candidate: ObservedAppCandidate) => string;
};

type ClassificationBootstrapSnapshot = {
  loadedOverrides: ClassificationDraftState["overrides"];
  loadedCategoryColorOverrides: ClassificationDraftState["categoryColorOverrides"];
  loadedCustomCategories: ClassificationDraftState["customCategories"];
  loadedDeletedCategories: ClassificationDraftState["deletedCategories"];
};

export function cloneObservedCandidates(observed: ObservedAppCandidate[]): ObservedAppCandidate[] {
  return observed.map((candidate) => ({ ...candidate }));
}

export function normalizeHexColor(colorValue: string | undefined): string | undefined {
  const raw = (colorValue ?? "").trim();
  if (!raw) return undefined;
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return undefined;
  return normalized.toUpperCase();
}

export function fallbackDisplayName(exeName: string): string {
  return exeName
    .replace(/\.exe$/i, "")
    .split(/[_\-\s.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildAppMappingOverride(params: AppMappingOverrideParams): AppOverride | null {
  const category = params.category;
  const displayName = params.displayName?.trim();
  const color = normalizeHexColor(params.color);
  const track = params.track;
  const captureTitle = params.captureTitle;
  if (!category && !displayName && !color && track !== false && captureTitle !== false) return null;
  const next: AppOverride = { enabled: true, updatedAt: params.updatedAt ?? Date.now() };
  if (category) next.category = category;
  if (displayName) next.displayName = displayName;
  if (color) next.color = color;
  if (track === false) next.track = false;
  if (captureTitle === false) next.captureTitle = false;
  return next;
}

export function createAppMappingDraftState(
  bootstrap: ClassificationBootstrapSnapshot,
): ClassificationDraftState {
  return cloneClassificationDraftState({
    overrides: bootstrap.loadedOverrides,
    categoryColorOverrides: bootstrap.loadedCategoryColorOverrides,
    customCategories: bootstrap.loadedCustomCategories,
    deletedCategories: bootstrap.loadedDeletedCategories,
  });
}

export function filterAndSortCandidates({
  candidates,
  filter,
  searchQuery,
  resolveMappedCategory,
  resolveEffectiveDisplayName,
}: FilterAndSortCandidatesParams): ObservedAppCandidate[] {
  const collator = createAppMappingCollator();
  const normalizedQuery = searchQuery?.trim().toLocaleLowerCase(getUiLocale()) ?? "";

  return candidates
    .filter((candidate) => {
      const category = resolveMappedCategory(candidate);
      if (filter === "all") return true;
      if (filter === "other") return category === "other";
      return category !== "other";
    })
    .filter((candidate) => {
      if (!normalizedQuery) return true;
      const haystack = [
        resolveEffectiveDisplayName(candidate),
        candidate.appName,
        candidate.exeName,
      ].join(" ").toLocaleLowerCase(getUiLocale());
      return haystack.includes(normalizedQuery);
    })
    .sort((left, right) => {
      const labelCompare = collator.compare(
        resolveEffectiveDisplayName(left),
        resolveEffectiveDisplayName(right),
      );
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return collator.compare(left.exeName, right.exeName);
    });
}
