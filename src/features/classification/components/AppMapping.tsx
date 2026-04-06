import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Palette, RefreshCw, Sparkles, Trash2, RotateCcw, SlidersHorizontal, X, Pencil } from "lucide-react";
import { ClassificationService } from "../services/classificationService";
import { ProcessMapper, type AppOverride } from "../../../lib/ProcessMapper";
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
import CategoryColorControls from "./CategoryColorControls";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
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
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return undefined;
  }
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
}): AppOverride | null {
  const category = params.category;
  const displayName = params.displayName?.trim();
  const color = normalizeHexColor(params.color);
  const track = params.track;
  const captureTitle = params.captureTitle;
  if (!category && !displayName && !color && track !== false && captureTitle !== false) {
    return null;
  }
  const next: AppOverride = {
    enabled: true,
    updatedAt: Date.now(),
  };
  if (category) next.category = category;
  if (displayName) next.displayName = displayName;
  if (color) next.color = color;
  if (track === false) next.track = false;
  if (captureTitle === false) next.captureTitle = false;
  return next;
}
export default function AppMapping({
  icons,
  refreshKey = 0,
  onOverridesChanged,
  onSessionsDeleted,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ObservedAppCandidate[]>([]);
  const [overrides, setOverrides] = useState<Record<string, AppOverride>>({});
  const [categoryColorOverrides, setCategoryColorOverrides] = useState<Record<string, string>>({});
  const [customCategories, setCustomCategories] = useState<UserAssignableAppCategory[]>([]);
  const [deletedCategories, setDeletedCategories] = useState<AppCategory[]>([]);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [editingNameExe, setEditingNameExe] = useState<string | null>(null);
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [categoryApplying, setCategoryApplying] = useState<string | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const iconThemeColors = useIconThemeColors(icons);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const bootstrap = await ClassificationService.loadClassificationBootstrap();
        if (cancelled) return;
        setCategoryColorOverrides(bootstrap.loadedCategoryColorOverrides);
        setCustomCategories(bootstrap.loadedCustomCategories);
        setDeletedCategories(bootstrap.loadedDeletedCategories);
        setOverrides(bootstrap.loadedOverrides);
        setCandidates(bootstrap.observed);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  const resolveAutoDisplayName = (candidate: ObservedAppCandidate) => {
    const appName = candidate.appName.trim();
    return appName || fallbackDisplayName(candidate.exeName) || candidate.exeName;
  };
  const resolveEffectiveDisplayName = (candidate: ObservedAppCandidate) => {
    return overrides[candidate.exeName]?.displayName?.trim() || resolveAutoDisplayName(candidate);
  };
  const resolveCandidateColor = (candidate: ObservedAppCandidate) => {
    const mapped = ProcessMapper.map(candidate.exeName, { appName: candidate.appName });
    return overrides[candidate.exeName]?.color
      ?? iconThemeColors[candidate.exeName]
      ?? mapped.color
      ?? "#64748B";
  };
  const resolveAssignedCategory = (candidate: ObservedAppCandidate): UserAssignableAppCategory => {
    const mapped = ProcessMapper.map(candidate.exeName, { appName: candidate.appName });
    const category = mapped.category;
    return category === "system" ? "other" : category;
  };
  const resolveTrackingEnabled = (candidate: ObservedAppCandidate) => (
    overrides[candidate.exeName]?.track !== false
  );
  const resolveTitleCaptureEnabled = (candidate: ObservedAppCandidate) => (
    overrides[candidate.exeName]?.captureTitle !== false
  );
  const filteredCandidates = useMemo(
    () => candidates.filter((candidate) => {
      const category = resolveAssignedCategory(candidate);
      if (filter === "all") return true;
      if (filter === "other") return category === "other";
      return category !== "other";
    }),
    [candidates, filter, overrides],
  );
  const counts = useMemo(() => {
    const all = candidates.length;
    const other = candidates.filter((candidate) => resolveAssignedCategory(candidate) === "other").length;
    const classified = Math.max(0, all - other);
    return { all, other, classified };
  }, [candidates, overrides]);
  const customCategoryOptions = useMemo(() => {
    const deletedSet = new Set(deletedCategories);
    const categories = new Set<UserAssignableAppCategory>();
    for (const category of customCategories) {
      if (isCustomCategory(category) && !deletedSet.has(category)) {
        categories.add(category);
      }
    }
    for (const override of Object.values(overrides)) {
      if (override.category && isCustomCategory(override.category) && !deletedSet.has(override.category)) {
        categories.add(override.category);
      }
    }
    for (const category of Object.keys(categoryColorOverrides)) {
      if (isCustomCategory(category) && !deletedSet.has(category)) {
        categories.add(category);
      }
    }
    return Array.from(categories)
      .sort((a, b) => ProcessMapper.getCategoryLabel(a).localeCompare(ProcessMapper.getCategoryLabel(b), "zh-CN"));
  }, [customCategories, overrides, categoryColorOverrides, deletedCategories]);

  const activeBuiltinCategories = useMemo(
    () => CATEGORY_OPTIONS.filter((category) => !deletedCategories.includes(category)),
    [deletedCategories],
  );

  const orderedAssignableCategories = useMemo<UserAssignableAppCategory[]>(() => {
    const base = activeBuiltinCategories.filter((category) => category !== "other");
    const hasOther = activeBuiltinCategories.includes("other");
    return hasOther
      ? [...base, ...customCategoryOptions, "other"]
      : [...base, ...customCategoryOptions];
  }, [activeBuiltinCategories, customCategoryOptions]);

  const colorControlCategories = useMemo<AppCategory[]>(
    () => [...orderedAssignableCategories],
    [orderedAssignableCategories],
  );
  const refreshCandidates = async () => {
    const observed = await ClassificationService.loadObservedAppCandidates();
    setCandidates(observed);
  };
  const applyOverride = async (exeName: string, nextOverride: AppOverride | null) => {
    await ClassificationService.saveAppOverride(exeName, nextOverride);
    setOverrides((prev) => {
      if (!nextOverride) {
        const next = { ...prev };
        delete next[exeName];
        return next;
      }
      return { ...prev, [exeName]: nextOverride };
    });
    onOverridesChanged?.();
  };
  const applyCategoryColor = async (category: AppCategory, colorValue: string | null) => {
    setCategoryApplying(category);
    try {
      await ClassificationService.saveCategoryColorOverride(category, colorValue);
      setCategoryColorOverrides((prev) => {
        const next = { ...prev };
        if (!colorValue) {
          delete next[category];
          return next;
        }
        next[category] = colorValue;
        return next;
      });
      onOverridesChanged?.();
    } finally {
      setCategoryApplying(null);
    }
  };
  const handleCreateCustomCategory = async () => {
    const customCategoryName = window.prompt("请输入自定义分类名称（最多4个字）", "");
    if (customCategoryName === null) return;
    const normalized = customCategoryName.trim();
    if (!normalized) return;
    const category = buildCustomCategory(normalized);
    await ClassificationService.saveCustomCategory(category);
    await ClassificationService.saveDeletedCategory(category, false);
    setCustomCategories((prev) => (
      prev.includes(category) ? prev : [...prev, category]
    ));
    setDeletedCategories((prev) => prev.filter((item) => item !== category));
  };

  const handleDeleteCategory = async (category: AppCategory) => {
    const categoryLabel = ProcessMapper.getCategoryLabel(category);
    const confirmed = window.confirm(
      buildDangerConfirmMessage("删除分类", `目标分类：${categoryLabel}`),
    );
    if (!confirmed) {
      return;
    }

    setCategoryApplying(category);
    try {
      const nextOverrides: Record<string, AppOverride> = { ...overrides };
      const saveTasks: Array<Promise<void>> = [];

      for (const [exeName, current] of Object.entries(overrides)) {
        if (current.category !== category) {
          continue;
        }

        const nextOverride = buildOverride({
          category: undefined,
          color: current.color,
          displayName: current.displayName,
          track: current.track !== false,
          captureTitle: current.captureTitle !== false,
        });

        saveTasks.push(ClassificationService.saveAppOverride(exeName, nextOverride));
        
        if (!nextOverride) {
          delete nextOverrides[exeName];
        } else {
          nextOverrides[exeName] = nextOverride;
        }
      }

      if (saveTasks.length > 0) {
        await Promise.all(saveTasks);
      }

      if (isCustomCategory(category)) {
        await ClassificationService.removeCategoryDefaultColorAssignment(category);
        await ClassificationService.deleteCustomCategory(category);
        setCustomCategories((prev) => prev.filter((item) => item !== category));
        await ClassificationService.saveDeletedCategory(category, false);
      } else {
        await ClassificationService.saveDeletedCategory(category, true);
      }

      await ClassificationService.saveCategoryColorOverride(category, null);

      const nextDeleted = isCustomCategory(category)
        ? deletedCategories.filter((item) => item !== category)
        : Array.from(new Set([...deletedCategories, category]));
      ClassificationService.setDeletedCategories(nextDeleted);

      setDeletedCategories(nextDeleted);
      setOverrides(nextOverrides);
      setCategoryColorOverrides((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      onOverridesChanged?.();
    } finally {
      setCategoryApplying(null);
    }
  };
  const handleCategoryAssign = async (candidate: ObservedAppCandidate, categoryValue: string) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    let category: UserAssignableAppCategory | undefined;
    if (categoryValue === AUTO_CATEGORY_VALUE) {
      category = undefined;
    } else {
      category = categoryValue as UserAssignableAppCategory;
    }
    const nextOverride = buildOverride({
      category,
      color: current?.color,
      displayName: current?.displayName,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
    });
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, nextOverride);
    } finally {
      setIsApplying(null);
    }
  };
  const handleColorAssign = async (candidate: ObservedAppCandidate, colorValue?: string | null) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    const nextOverride = buildOverride({
      category: current?.category,
      displayName: current?.displayName,
      color: colorValue ?? undefined,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
    });
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, nextOverride);
    } finally {
      setIsApplying(null);
    }
  };
  const handleNameCommit = async (candidate: ObservedAppCandidate) => {
    const draftRaw = (nameDrafts[candidate.exeName] ?? resolveEffectiveDisplayName(candidate)).trim();
    const autoName = resolveAutoDisplayName(candidate);
    const displayName = draftRaw && draftRaw !== autoName ? draftRaw : undefined;
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName,
      track: current?.track !== false,
      captureTitle: current?.captureTitle !== false,
    });
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, nextOverride);
      setNameDrafts((prev) => {
        const next = { ...prev };
        next[candidate.exeName] = displayName ?? autoName;
        return next;
      });
    } finally {
      setIsApplying(null);
    }
  };
  const handleResetAppOverride = async (candidate: ObservedAppCandidate) => {
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, null);
      setNameDrafts((prev) => {
        const next = { ...prev };
        next[candidate.exeName] = resolveAutoDisplayName(candidate);
        return next;
      });
    } finally {
      setIsApplying(null);
    }
  };
  const handleDeleteAllSessions = async (candidate: ObservedAppCandidate) => {
    const displayName = resolveEffectiveDisplayName(candidate);
    const confirmed = window.confirm(
      buildDangerConfirmMessage("删除应用记录", `目标应用：${displayName}`),
    );
    if (!confirmed) return;
    setIsApplying(candidate.exeName);
    try {
      await ClassificationService.deleteObservedAppSessions(candidate.exeName, "all");
      await refreshCandidates();
      onSessionsDeleted?.();
    } finally {
      setIsApplying(null);
    }
  };
  const handleTrackingToggle = async (candidate: ObservedAppCandidate, nextTrack: boolean) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName: current?.displayName,
      track: nextTrack,
      captureTitle: current?.captureTitle !== false,
    });
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, nextOverride);
    } finally {
      setIsApplying(null);
    }
  };
  const handleTitleCaptureToggle = async (
    candidate: ObservedAppCandidate,
    nextCaptureTitle: boolean,
  ) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    const nextOverride = buildOverride({
      category: current?.category,
      color: current?.color,
      displayName: current?.displayName,
      track: current?.track !== false,
      captureTitle: nextCaptureTitle,
    });
    setIsApplying(candidate.exeName);
    try {
      await applyOverride(candidate.exeName, nextOverride);
    } finally {
      setIsApplying(null);
    }
  };
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
            <h1 className="text-[1.1rem] font-semibold text-[var(--qp-text-primary)]">应用美化与隐私</h1>
            <p className="mt-1 text-[11px] text-[var(--qp-text-tertiary)]">按应用设置分类、颜色与标题记录</p>
          </div>
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
            分类控制
          </button>
        </div>
      </section>
      <div className="qp-panel flex-1 min-h-0 p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-2 text-[var(--qp-text-tertiary)]">
            <RefreshCw size={15} className="animate-spin" />
            加载中...
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--qp-text-tertiary)]">
            当前筛选下暂无应用
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {filteredCandidates.map((candidate) => {
              const displayName = resolveEffectiveDisplayName(candidate);
              const displayColor = resolveCandidateColor(candidate);
              const assignedCategory = resolveAssignedCategory(candidate);
              const trackingEnabled = resolveTrackingEnabled(candidate);
              const titleCaptureEnabled = resolveTitleCaptureEnabled(candidate);
              const isBusy = isApplying === candidate.exeName;
              const isEditingName = editingNameExe === candidate.exeName;
              const inputValue = nameDrafts[candidate.exeName] ?? displayName;
              const hasManualColor = Boolean(overrides[candidate.exeName]?.color);
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
                                setNameDrafts((prev) => ({ ...prev, [candidate.exeName]: nextValue }));
                              }}
                              onBlur={() => {
                                void handleNameCommit(candidate);
                                setEditingNameExe((prev) => (prev === candidate.exeName ? null : prev));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                  return;
                                }
                                if (event.key === "Escape") {
                                  setNameDrafts((prev) => ({
                                    ...prev,
                                    [candidate.exeName]: displayName,
                                  }));
                                  setEditingNameExe((prev) => (prev === candidate.exeName ? null : prev));
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
                          onChange={(event) => void handleColorAssign(candidate, event.target.value)}
                          className="h-7 w-7 cursor-pointer rounded-[6px] border border-[var(--qp-border-subtle)] bg-transparent p-0.5 disabled:cursor-not-allowed"
                          title="应用颜色"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleColorAssign(candidate, null)}
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
                        onChange={(event) => void handleCategoryAssign(candidate, event.target.value)}
                      >
                        <option value={AUTO_CATEGORY_VALUE}>自动识别</option>
                        {orderedAssignableCategories.map((category) => (
                          <option key={category} value={category}>
                            {ProcessMapper.getCategoryLabel(category)}
                          </option>
                        ))}
                      </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleTitleCaptureToggle(candidate, !titleCaptureEnabled)}
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
                          onClick={() => void handleTrackingToggle(candidate, !trackingEnabled)}
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
                          onClick={() => void handleResetAppOverride(candidate)}
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
                  onClick={() => void handleCreateCustomCategory()}
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
                busyCategory={categoryApplying}
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




