import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Palette, RefreshCw, Save, Sparkles, Trash2, RotateCcw, SlidersHorizontal, X, Pencil } from "lucide-react";
import { UI_TEXT } from "../../../lib/copy";
import {
  ClassificationService,
  type AppOverride,
  type ClassificationDraftState,
} from "../services/classificationService";
import { buildDangerConfirmMessage } from "../../../lib/confirm";
import type { CandidateFilter, ObservedAppCandidate } from "../types";
import type { AppCategory } from "../../../lib/config/categoryTokens";
import {
  buildCustomCategory,
  isCustomCategory,
  USER_ASSIGNABLE_CATEGORIES,
  type UserAssignableAppCategory,
} from "../../../lib/config/categoryTokens";
import { useIconThemeColors } from "../../../shared/hooks/useIconThemeColors";
import { AppClassificationFacade } from "../../../shared/lib/appClassificationFacade";
import CategoryColorControls from "./CategoryColorControls";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onOverridesChanged?: () => void;
  onSessionsDeleted?: () => void;
}

const FILTER_OPTIONS: Array<{ value: CandidateFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "other", label: "未分类" },
  { value: "classified", label: "已分类" },
];
const CATEGORY_OPTIONS: UserAssignableAppCategory[] = USER_ASSIGNABLE_CATEGORIES;
const AUTO_CATEGORY_VALUE = "__auto__";

function normalizeHexColor(colorValue: string | undefined): string | undefined {
  const raw = (colorValue ?? "").trim();
  if (!raw) return undefined;
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return undefined;
  return normalized.toUpperCase();
}

function fallbackDisplayName(exeName: string) {
  return exeName
    .replace(/\.exe$/i, "")
    .split(/[_\-\s.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildOverride(params: {
  category?: UserAssignableAppCategory;
  displayName?: string;
  color?: string;
  track?: boolean;
  captureTitle?: boolean;
  updatedAt?: number;
}): AppOverride | null {
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

function createDraftState(bootstrap: Awaited<ReturnType<typeof ClassificationService.loadClassificationBootstrap>>): ClassificationDraftState {
  return {
    overrides: bootstrap.loadedOverrides,
    categoryColorOverrides: bootstrap.loadedCategoryColorOverrides,
    customCategories: bootstrap.loadedCustomCategories,
    deletedCategories: bootstrap.loadedDeletedCategories,
  };
}

export default function AppMapping({
  icons,
  refreshKey = 0,
  onDirtyChange,
  onOverridesChanged,
  onSessionsDeleted,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ObservedAppCandidate[]>([]);
  const [savedState, setSavedState] = useState<ClassificationDraftState | null>(null);
  const [draftState, setDraftState] = useState<ClassificationDraftState | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [nameEditSnapshots, setNameEditSnapshots] = useState<Record<string, AppOverride | null>>({});
  const [editingNameExe, setEditingNameExe] = useState<string | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [saving, setSaving] = useState(false);
  const [deletingSessionsExe, setDeletingSessionsExe] = useState<string | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const iconThemeColors = useIconThemeColors(icons);
  const skipNextNameBlurExeRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const bootstrap = await ClassificationService.loadClassificationBootstrap();
        if (cancelled) return;
        const nextState = createDraftState(bootstrap);
        setSavedState(nextState);
        setDraftState(nextState);
        setCandidates(bootstrap.observed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const draftOverrides = draftState?.overrides ?? {};
  const draftCategoryColorOverrides = draftState?.categoryColorOverrides ?? {};
  const draftCustomCategories = draftState?.customCategories ?? [];
  const draftDeletedCategories = draftState?.deletedCategories ?? [];

  const hasUnsavedChanges = (() => {
    if (!savedState || !draftState) return false;
    return ClassificationService.hasDraftChanges(savedState, draftState);
  })();

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => () => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  const resolveCategoryColor = (category: AppCategory) => (
    draftCategoryColorOverrides[category] ?? AppClassificationFacade.getCategoryColor(category)
  );

  const resolveAutoDisplayName = (candidate: ObservedAppCandidate) => {
    const appName = candidate.appName.trim();
    return appName || fallbackDisplayName(candidate.exeName) || candidate.exeName;
  };

  const resolveMappedCategory = (candidate: ObservedAppCandidate): UserAssignableAppCategory => {
    const mapped = AppClassificationFacade.mapApp(candidate.exeName, { appName: candidate.appName });
    const overrideCategory = draftOverrides[candidate.exeName]?.category;
    const category = overrideCategory ?? mapped.category;
    return category === "system" ? "other" : category;
  };

  const resolveEffectiveDisplayName = (candidate: ObservedAppCandidate) => {
    const mapped = AppClassificationFacade.mapApp(candidate.exeName, { appName: candidate.appName });
    return draftOverrides[candidate.exeName]?.displayName?.trim()
      || mapped.name
      || resolveAutoDisplayName(candidate);
  };

  const resolveTrackingEnabled = (candidate: ObservedAppCandidate) => {
    const mapped = AppClassificationFacade.mapApp(candidate.exeName, { appName: candidate.appName });
    const baseCategory = draftOverrides[candidate.exeName]?.category ?? mapped.category;
    return baseCategory !== "system" && draftOverrides[candidate.exeName]?.track !== false;
  };

  const resolveTitleCaptureEnabled = (candidate: ObservedAppCandidate) => (
    draftOverrides[candidate.exeName]?.captureTitle !== false
  );

  const resolveCandidateColor = (candidate: ObservedAppCandidate) => {
    const overrideColor = draftOverrides[candidate.exeName]?.color;
    if (overrideColor) return overrideColor;
    const mappedCategory = resolveMappedCategory(candidate);
    return iconThemeColors[candidate.exeName] ?? resolveCategoryColor(mappedCategory);
  };

  const filteredCandidates = useMemo(
    () => candidates.filter((candidate) => {
      const category = resolveMappedCategory(candidate);
      if (filter === "all") return true;
      if (filter === "other") return category === "other";
      return category !== "other";
    }),
    [candidates, filter, draftOverrides],
  );

  const counts = useMemo(() => {
    const all = candidates.length;
    const other = candidates.filter((candidate) => resolveMappedCategory(candidate) === "other").length;
    const classified = Math.max(0, all - other);
    return { all, other, classified };
  }, [candidates, draftOverrides]);

  const customCategoryOptions = useMemo(() => {
    const deletedSet = new Set(draftDeletedCategories);
    const categories = new Set<UserAssignableAppCategory>();
    for (const category of draftCustomCategories) {
      if (isCustomCategory(category) && !deletedSet.has(category)) categories.add(category);
    }
    for (const override of Object.values(draftOverrides)) {
      if (override.category && isCustomCategory(override.category) && !deletedSet.has(override.category)) {
        categories.add(override.category);
      }
    }
    for (const category of Object.keys(draftCategoryColorOverrides)) {
      if (isCustomCategory(category) && !deletedSet.has(category)) categories.add(category);
    }
    return Array.from(categories)
      .sort((a, b) => AppClassificationFacade.getCategoryLabel(a).localeCompare(AppClassificationFacade.getCategoryLabel(b), "zh-CN"));
  }, [draftCustomCategories, draftOverrides, draftCategoryColorOverrides, draftDeletedCategories]);

  const activeBuiltinCategories = useMemo(
    () => CATEGORY_OPTIONS.filter((category) => !draftDeletedCategories.includes(category)),
    [draftDeletedCategories],
  );

  const orderedAssignableCategories = useMemo<UserAssignableAppCategory[]>(() => {
    const base = activeBuiltinCategories.filter((category) => category !== "other");
    const hasOther = activeBuiltinCategories.includes("other");
    return hasOther ? [...base, ...customCategoryOptions, "other"] : [...base, ...customCategoryOptions];
  }, [activeBuiltinCategories, customCategoryOptions]);

  const colorControlCategories = useMemo<AppCategory[]>(
    () => [...orderedAssignableCategories],
    [orderedAssignableCategories],
  );

  const refreshCandidates = async () => {
    const observed = await ClassificationService.loadObservedAppCandidates();
    setCandidates(observed);
  };

  const updateOverride = (exeName: string, nextOverride: AppOverride | null) => {
    setDraftState((current) => {
      if (!current) return current;
      const nextOverrides = { ...current.overrides };
      if (!nextOverride) delete nextOverrides[exeName];
      else nextOverrides[exeName] = nextOverride;
      return { ...current, overrides: nextOverrides };
    });
  };

  const applyCategoryColor = (category: AppCategory, colorValue: string | null) => {
    setDraftState((current) => {
      if (!current) return current;
      const next = { ...current.categoryColorOverrides };
      if (!colorValue) delete next[category];
      else next[category] = colorValue;
      return { ...current, categoryColorOverrides: next };
    });
  };

  const handleCreateCustomCategory = () => {
    const customCategoryName = window.prompt("请输入自定义分类名称（最多4个字）", "");
    if (customCategoryName === null) return;
    const normalized = customCategoryName.trim();
    if (!normalized) return;
    const category = buildCustomCategory(normalized);
    setDraftState((current) => {
      if (!current) return current;
      return {
        ...current,
        customCategories: current.customCategories.includes(category)
          ? current.customCategories
          : [...current.customCategories, category],
        deletedCategories: current.deletedCategories.filter((item) => item !== category),
      };
    });
  };

  const handleDeleteCategory = (category: AppCategory) => {
    const categoryLabel = AppClassificationFacade.getCategoryLabel(category);
    const confirmed = window.confirm(
      buildDangerConfirmMessage("删除分类", `目标分类：${categoryLabel}`),
    );
    if (!confirmed) return;
    setDraftState((current) => {
      if (!current) return current;
      const nextOverrides: Record<string, AppOverride> = {};
      for (const [exeName, override] of Object.entries(current.overrides)) {
        if (override.category !== category) {
          nextOverrides[exeName] = override;
          continue;
        }
        const nextOverride = buildOverride({
          category: undefined,
          color: override.color,
          displayName: override.displayName,
          track: override.track !== false,
          captureTitle: override.captureTitle !== false,
          updatedAt: override.updatedAt,
        });
        if (nextOverride) nextOverrides[exeName] = nextOverride;
      }
      const nextCategoryColorOverrides = { ...current.categoryColorOverrides };
      delete nextCategoryColorOverrides[category];
      if (isCustomCategory(category)) {
        return {
          ...current,
          overrides: nextOverrides,
          categoryColorOverrides: nextCategoryColorOverrides,
          customCategories: current.customCategories.filter((item) => item !== category),
          deletedCategories: current.deletedCategories.filter((item) => item !== category),
        };
      }
      return {
        ...current,
        overrides: nextOverrides,
        categoryColorOverrides: nextCategoryColorOverrides,
        deletedCategories: Array.from(new Set([...current.deletedCategories, category])),
      };
    });
  };

  const handleCategoryAssign = (candidate: ObservedAppCandidate, categoryValue: string) => {
    const current = draftOverrides[candidate.exeName] ?? null;
    const category = categoryValue === AUTO_CATEGORY_VALUE ? undefined : categoryValue as UserAssignableAppCategory;
    const nextOverride = buildOverride({
      category,
      color: current?.color,
      displayName: current?.displayName,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
      updatedAt: current?.updatedAt,
    });
    updateOverride(candidate.exeName, nextOverride);
  };

  const handleColorAssign = (candidate: ObservedAppCandidate, colorValue?: string | null) => {
    const current = draftOverrides[candidate.exeName] ?? null;
    const nextOverride = buildOverride({
      category: current?.category,
      displayName: current?.displayName,
      color: colorValue ?? undefined,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
      updatedAt: current?.updatedAt,
    });
    updateOverride(candidate.exeName, nextOverride);
  };

  const syncNameDraftToPageDraft = (
    candidate: ObservedAppCandidate,
    nextInputValue: string,
    normalizeInputDraft: boolean = false,
  ) => {
    const draftRaw = nextInputValue.trim();
    const autoName = resolveAutoDisplayName(candidate);
    const displayName = draftRaw && draftRaw !== autoName ? draftRaw : undefined;
    const current = draftOverrides[candidate.exeName] ?? null;
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
      updatedAt: current?.updatedAt,
    });
    updateOverride(candidate.exeName, nextOverride);
    setNameDrafts((prev) => ({
      ...prev,
      [candidate.exeName]: normalizeInputDraft ? (displayName ?? autoName) : nextInputValue,
    }));
  };

  const resolveDisplayNameFromOverride = (
    candidate: ObservedAppCandidate,
    override: AppOverride | null,
  ) => {
    const mapped = AppClassificationFacade.mapApp(candidate.exeName, { appName: candidate.appName });
    return override?.displayName?.trim()
      || mapped.name
      || resolveAutoDisplayName(candidate);
  };

  const handleNameCommit = (candidate: ObservedAppCandidate) => {
    const inputValue = nameDrafts[candidate.exeName] ?? resolveEffectiveDisplayName(candidate);
    syncNameDraftToPageDraft(candidate, inputValue, true);
    setNameEditSnapshots((prev) => {
      const next = { ...prev };
      delete next[candidate.exeName];
      return next;
    });
  };

  const handleNameEditCancel = (candidate: ObservedAppCandidate) => {
    skipNextNameBlurExeRef.current = candidate.exeName;
    const snapshot = Object.prototype.hasOwnProperty.call(nameEditSnapshots, candidate.exeName)
      ? nameEditSnapshots[candidate.exeName]
      : (draftOverrides[candidate.exeName] ?? null);
    updateOverride(candidate.exeName, snapshot);
    setNameDrafts((prev) => ({
      ...prev,
      [candidate.exeName]: resolveDisplayNameFromOverride(candidate, snapshot),
    }));
    setNameEditSnapshots((prev) => {
      const next = { ...prev };
      delete next[candidate.exeName];
      return next;
    });
    setEditingNameExe((prev) => (prev === candidate.exeName ? null : prev));
  };

  const handleResetAppOverride = (candidate: ObservedAppCandidate) => {
    updateOverride(candidate.exeName, null);
    setNameDrafts((prev) => ({ ...prev, [candidate.exeName]: resolveAutoDisplayName(candidate) }));
  };

  const handleDeleteAllSessions = async (candidate: ObservedAppCandidate) => {
    const displayName = resolveEffectiveDisplayName(candidate);
    const confirmed = window.confirm(
      buildDangerConfirmMessage("删除应用记录", `目标应用：${displayName}`),
    );
    if (!confirmed) return;
    setDeletingSessionsExe(candidate.exeName);
    try {
      await ClassificationService.deleteObservedAppSessions(candidate.exeName, "all");
      await refreshCandidates();
      onSessionsDeleted?.();
    } finally {
      setDeletingSessionsExe(null);
    }
  };

  const handleTrackingToggle = (candidate: ObservedAppCandidate, nextTrack: boolean) => {
    const current = draftOverrides[candidate.exeName] ?? null;
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName: current?.displayName,
      track: nextTrack,
      captureTitle: current?.captureTitle !== false,
      updatedAt: current?.updatedAt,
    });
    updateOverride(candidate.exeName, nextOverride);
  };

  const handleTitleCaptureToggle = (candidate: ObservedAppCandidate, nextCaptureTitle: boolean) => {
    const current = draftOverrides[candidate.exeName] ?? null;
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName: current?.displayName,
      track: current?.track !== false,
      captureTitle: nextCaptureTitle,
      updatedAt: current?.updatedAt,
    });
    updateOverride(candidate.exeName, nextOverride);
  };

  const handleSave = async () => {
    if (!savedState || !draftState || !hasUnsavedChanges || saving) return;
    setSaving(true);
    setSaveStatus("saving");
    try {
      await ClassificationService.commitDraftChanges(savedState, draftState);
      setSavedState(draftState);
      setNameEditSnapshots({});
      setEditingNameExe(null);
      skipNextNameBlurExeRef.current = null;
      onOverridesChanged?.();
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1800);
    } catch (error) {
      console.error("save app mapping failed", error);
      setSaveStatus("idle");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!savedState || !hasUnsavedChanges || saving) return;
    setDraftState(savedState);
    setNameDrafts({});
    setNameEditSnapshots({});
    setEditingNameExe(null);
    skipNextNameBlurExeRef.current = null;
    setSaveStatus("idle");
  };

  if (loading || !draftState || !savedState) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-[var(--qp-text-tertiary)]">
        <RefreshCw size={15} className="animate-spin" />
        {UI_TEXT.mapping.loading}
      </div>
    );
  }

  return (
    <motion.div
      key="app-mapping"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="flex h-full min-w-0 flex-col gap-4 md:gap-5 overflow-hidden"
    >
      <header className="qp-panel flex items-center justify-between p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] text-[var(--qp-accent-default)] flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-[1.1rem] font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.mapping.title}</h1>
            <p className="mt-1 text-[11px] text-[var(--qp-text-tertiary)]">{UI_TEXT.mapping.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="qp-status flex px-3 py-1.5 rounded-[8px] items-center text-xs font-semibold">
            {saveStatus === "saving" && (
              <span className="text-[var(--qp-accent-default)] flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                {UI_TEXT.mapping.saving}
              </span>
            )}
            {saveStatus === "saved" && !hasUnsavedChanges && (
              <span className="text-[var(--qp-success)] flex items-center gap-1.5">
                <Save size={14} />
                {UI_TEXT.mapping.saved}
              </span>
            )}
            {saveStatus !== "saving" && hasUnsavedChanges && (
              <span className="text-[var(--qp-warning)]">{UI_TEXT.mapping.unsaved}</span>
            )}
            {saveStatus === "idle" && !hasUnsavedChanges && (
              <span className="text-[var(--qp-text-tertiary)]">{UI_TEXT.mapping.idle}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!hasUnsavedChanges || saving}
            className="qp-button-secondary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {UI_TEXT.mapping.cancel}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!hasUnsavedChanges || saving}
            className="qp-button-primary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? UI_TEXT.mapping.saving : UI_TEXT.mapping.save}
          </button>
        </div>
      </header>

      <section className="qp-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_OPTIONS.map((item) => {
              const count = item.value === "all"
                ? counts.all
                : item.value === "other"
                  ? counts.other
                  : counts.classified;
              return (
                <button
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  className={`rounded-[8px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === item.value
                      ? "border-[color:var(--qp-accent-default)] bg-[var(--qp-accent-muted)] text-[var(--qp-accent-default)]"
                      : "border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] text-[var(--qp-text-secondary)] hover:border-[var(--qp-border-strong)]"
                  }`}
                >
                  {item.label} ({count})
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowCategoryDialog(true)}
            className="qp-button-secondary inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-xs font-semibold"
          >
            <SlidersHorizontal size={14} />
            {UI_TEXT.mapping.categoryControl}
          </button>
        </div>
      </section>

      <div className="qp-panel flex-1 min-h-0 p-4">
        {filteredCandidates.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--qp-text-tertiary)]">
            {UI_TEXT.mapping.emptyState}
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {filteredCandidates.map((candidate) => {
                const displayName = resolveEffectiveDisplayName(candidate);
                const displayColor = resolveCandidateColor(candidate);
                const assignedCategory = resolveMappedCategory(candidate);
                const trackingEnabled = resolveTrackingEnabled(candidate);
                const titleCaptureEnabled = resolveTitleCaptureEnabled(candidate);
                const isBusy = saving || deletingSessionsExe === candidate.exeName;
                const isEditingName = editingNameExe === candidate.exeName;
                const inputValue = nameDrafts[candidate.exeName] ?? displayName;
                const hasManualColor = Boolean(draftOverrides[candidate.exeName]?.color);
                return (
                  <div
                    key={candidate.exeName}
                    className="relative rounded-[12px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] px-4 py-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className="mt-0.5 h-10 w-10 rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] p-1.5"
                          style={{ boxShadow: `0 0 0 2px ${displayColor}22` }}
                        >
                          {icons[candidate.exeName] ? (
                            <img src={icons[candidate.exeName]} className="h-full w-full object-contain" alt="" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--qp-text-tertiary)]">
                              {(displayName || candidate.exeName).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="inline-flex max-w-full items-center gap-1">
                            {isEditingName ? (
                              <input
                                id={`app-name-${candidate.exeName}`}
                                value={inputValue}
                                autoFocus
                                disabled={isBusy}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  syncNameDraftToPageDraft(candidate, nextValue);
                                }}
                                onBlur={() => {
                                  if (skipNextNameBlurExeRef.current === candidate.exeName) {
                                    skipNextNameBlurExeRef.current = null;
                                    return;
                                  }
                                  handleNameCommit(candidate);
                                  setEditingNameExe((prev) => (prev === candidate.exeName ? null : prev));
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                    return;
                                  }
                                  if (event.key === "Escape") {
                                    handleNameEditCancel(candidate);
                                  }
                                }}
                                className="max-w-[240px] truncate rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-2 py-1 text-[15px] font-semibold text-[var(--qp-text-primary)] outline-none disabled:cursor-not-allowed"
                              />
                            ) : (
                              <span className="truncate rounded-[8px] px-2 py-1 text-[15px] font-semibold text-[var(--qp-text-primary)]">
                                {displayName}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                skipNextNameBlurExeRef.current = null;
                                setNameEditSnapshots((prev) => ({
                                  ...prev,
                                  [candidate.exeName]: draftOverrides[candidate.exeName] ?? null,
                                }));
                                setEditingNameExe(candidate.exeName);
                                setNameDrafts((prev) => ({
                                  ...prev,
                                  [candidate.exeName]: prev[candidate.exeName] ?? displayName,
                                }));
                              }}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--qp-text-tertiary)] transition hover:bg-[var(--qp-bg-panel)] hover:text-[var(--qp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                              title="修改应用名称"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
                            <span className="rounded-[6px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--qp-text-secondary)]">
                              {candidate.exeName}
                            </span>
                            {!trackingEnabled && (
                              <span className="rounded-[6px] border border-[color:var(--qp-warning)]/25 bg-[color:var(--qp-warning)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--qp-warning)]">
                                不统计
                              </span>
                            )}
                            {!titleCaptureEnabled && (
                              <span className="rounded-[6px] border border-[var(--qp-border-subtle)] bg-[var(--qp-badge-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--qp-text-secondary)]">
                                不记标题
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2 items-end">
                        <div className="flex flex-nowrap items-center gap-2">
                          <div className="order-2 flex max-w-full flex-wrap items-center gap-2 rounded-[8px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] px-2 py-1.5">
                            <Palette size={14} className="text-[var(--qp-text-tertiary)]" />
                            <span className="rounded-[6px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--qp-text-secondary)]">
                              {displayColor}
                            </span>
                            <input
                              type="color"
                              value={displayColor}
                              disabled={isBusy}
                              onChange={(event) => handleColorAssign(candidate, event.target.value)}
                              className="h-7 w-7 cursor-pointer rounded-[6px] border border-[var(--qp-border-subtle)] bg-transparent p-0.5 disabled:cursor-not-allowed"
                              title="应用颜色"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleColorAssign(candidate, null)}
                              className={`rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                hasManualColor ? "text-[var(--qp-text-tertiary)] hover:text-[var(--qp-text-secondary)]" : "text-[var(--qp-text-disabled)]"
                              }`}
                              title="恢复默认颜色"
                            >
                              默认
                            </button>
                          </div>
                          <select
                            className="qp-control order-1 min-w-[120px] rounded-[8px] border bg-[var(--qp-bg-panel)] px-3 py-2 text-sm font-semibold text-[var(--qp-text-secondary)] outline-none cursor-pointer disabled:cursor-not-allowed"
                            value={assignedCategory}
                            disabled={isBusy}
                            onChange={(event) => handleCategoryAssign(candidate, event.target.value)}
                          >
                            <option value={AUTO_CATEGORY_VALUE}>自动识别</option>
                            {orderedAssignableCategories.map((category) => (
                              <option key={category} value={category}>
                                {AppClassificationFacade.getCategoryLabel(category)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleTitleCaptureToggle(candidate, !titleCaptureEnabled)}
                            className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[10px] leading-none font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              titleCaptureEnabled
                                ? "text-[var(--qp-text-secondary)] hover:bg-[var(--qp-bg-panel)]"
                                : "text-[var(--qp-accent-default)] hover:bg-[var(--qp-accent-muted)]"
                            }`}
                            title={titleCaptureEnabled ? "不记录该应用窗口标题" : "恢复记录该应用窗口标题"}
                          >
                            {titleCaptureEnabled ? "记录标题" : "不记标题"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleTrackingToggle(candidate, !trackingEnabled)}
                            className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[10px] leading-none font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              trackingEnabled
                                ? "text-[var(--qp-warning)] hover:bg-[color:var(--qp-warning)]/10"
                                : "text-[var(--qp-success)] hover:bg-[color:var(--qp-success)]/10"
                            }`}
                            title={trackingEnabled ? "将该应用排除出统计" : "恢复该应用进入统计"}
                          >
                            {trackingEnabled ? "统计中" : "不统计"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleResetAppOverride(candidate)}
                            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[10px] leading-none font-medium text-[var(--qp-text-secondary)] hover:bg-[var(--qp-bg-panel)] disabled:cursor-not-allowed disabled:opacity-50"
                            title="恢复该应用默认识别"
                          >
                            <RotateCcw size={12} />
                            恢复默认
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteAllSessions(candidate)}
                            className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[10px] leading-none font-medium text-[var(--qp-danger)] hover:bg-[color:var(--qp-danger)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                            title="删除应用记录"
                          >
                            <Trash2 size={12} />
                            删除应用记录
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showCategoryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/22 p-4">
          <div className="w-full max-w-5xl rounded-[14px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-canvas)] p-4 shadow-[var(--qp-shadow-overlay)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--qp-text-primary)]">分类控制</h3>
                <p className="text-xs text-[var(--qp-text-tertiary)]">在这里新建分类并调整分类主色</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateCustomCategory}
                  className="qp-button-secondary rounded-[8px] px-2.5 py-1.5 text-xs font-semibold"
                >
                  + 新建分类
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryDialog(false)}
                  className="rounded-[8px] p-1.5 text-[var(--qp-text-tertiary)] hover:bg-[var(--qp-bg-panel)]"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <CategoryColorControls
                categories={colorControlCategories}
                getCategoryColor={resolveCategoryColor}
                onApplyColor={applyCategoryColor}
                onDeleteCategory={handleDeleteCategory}
              />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
