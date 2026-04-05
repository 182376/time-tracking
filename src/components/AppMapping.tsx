import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Palette, RefreshCw, Sparkles, Trash2, RotateCcw, SlidersHorizontal, X, Pencil } from "lucide-react";
import { SettingsService } from "../lib/services/SettingsService";
import { ProcessMapper, type AppOverride } from "../lib/ProcessMapper";
import { buildDangerConfirmMessage } from "../lib/confirm";
import type { ObservedAppCandidate } from "../lib/settings";
import type { AppCategory } from "../lib/config/categoryTokens";
import {
  buildCustomCategory,
  isCustomCategory,
  USER_ASSIGNABLE_CATEGORIES,
  type UserAssignableAppCategory,
} from "../lib/config/categoryTokens";
import { useIconThemeColors } from "../hooks/useIconThemeColors";
import CategoryColorControls from "./CategoryColorControls";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
  onOverridesChanged?: () => void;
  onSessionsDeleted?: () => void;
}

type CandidateFilter = "all" | "other" | "classified";

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
        const [observed, loadedOverrides, loadedCategoryColorOverrides, loadedCustomCategories, loadedDeletedCategories] = await Promise.all([
          SettingsService.loadObservedAppCandidates(),
          SettingsService.loadAppOverrides(),
          SettingsService.loadCategoryColorOverrides(),
          SettingsService.loadCustomCategories(),
          SettingsService.loadDeletedCategories(),
        ]);
        if (cancelled) return;
        ProcessMapper.setCategoryColorOverrides(loadedCategoryColorOverrides ?? {});
        ProcessMapper.setDeletedCategories(loadedDeletedCategories ?? []);
        ProcessMapper.setUserOverrides(loadedOverrides);
        setCategoryColorOverrides(loadedCategoryColorOverrides ?? {});
        setCustomCategories(loadedCustomCategories);
        setDeletedCategories(loadedDeletedCategories ?? []);
        setOverrides(loadedOverrides);
        setCandidates(observed);
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
    const observed = await SettingsService.loadObservedAppCandidates();
    setCandidates(observed);
  };

  const applyOverride = async (exeName: string, nextOverride: AppOverride | null) => {
    await SettingsService.saveAppOverride(exeName, nextOverride);
    ProcessMapper.setUserOverride(exeName, nextOverride);
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
      await SettingsService.saveCategoryColorOverride(category, colorValue);
      ProcessMapper.setCategoryColorOverride(category, colorValue);
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
    await SettingsService.saveCustomCategory(category);
    await SettingsService.saveDeletedCategory(category, false);
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

        saveTasks.push(SettingsService.saveAppOverride(exeName, nextOverride));
        ProcessMapper.setUserOverride(exeName, nextOverride);
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
        await SettingsService.deleteCustomCategory(category);
        setCustomCategories((prev) => prev.filter((item) => item !== category));
        await SettingsService.saveDeletedCategory(category, false);
      } else {
        await SettingsService.saveDeletedCategory(category, true);
      }

      await SettingsService.saveCategoryColorOverride(category, null);
      ProcessMapper.setCategoryColorOverride(category, null);

      const nextDeleted = isCustomCategory(category)
        ? deletedCategories.filter((item) => item !== category)
        : Array.from(new Set([...deletedCategories, category]));
      ProcessMapper.setDeletedCategories(nextDeleted);

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
      await SettingsService.deleteObservedAppSessions(candidate.exeName, "all");
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex h-full min-w-0 flex-col gap-5 overflow-hidden"
    >
      <header className="glass-card flex items-center justify-between bg-white/40 p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-600 shadow-inner flex items-center justify-center">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">应用美化与隐私</h1>
            <p className="mt-0.5 text-xs text-slate-500">按应用设置分类、颜色与标题记录</p>
          </div>
        </div>
      </header>

      <section className="glass-card bg-white/25 p-4">
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
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === item.value
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-white text-slate-600 hover:bg-slate-100"
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
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white"
          >
            <SlidersHorizontal size={14} />
            分类控制
          </button>
        </div>
      </section>

      <div className="glass-card flex-1 min-h-0 bg-white/25 p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-2 text-slate-400">
            <RefreshCw size={16} className="animate-spin" />
            加载中...
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
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
                  className="relative rounded-2xl border border-white/75 bg-white/60 px-4 py-4 shadow-[0_10px_28px_-22px_rgba(15,23,42,0.55)] backdrop-blur-[1px]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="mt-0.5 h-10 w-10 rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm"
                        style={{ boxShadow: `0 0 0 2px ${displayColor}22` }}
                      >
                        {icons[candidate.exeName] ? (
                          <img src={icons[candidate.exeName]} className="h-full w-full object-contain" alt="" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">
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
                              className="max-w-[240px] truncate rounded-lg border border-indigo-200 bg-white/90 px-2 py-1 text-base font-semibold text-slate-800 outline-none ring-2 ring-indigo-100 disabled:cursor-not-allowed"
                            />
                          ) : (
                            <span className="truncate rounded-lg px-2 py-1 text-base font-semibold text-slate-800">
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
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                            title="修改应用名称"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {candidate.exeName}
                          </span>
                          {!trackingEnabled && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              不统计
                            </span>
                          )}
                          {!titleCaptureEnabled && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                              不记标题
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 items-end">
                      <div className="flex flex-nowrap items-center gap-2">
                      <div className="order-2 flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-100">
                        <Palette size={14} className="text-slate-500" />
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {displayColor}
                        </span>
                        <input
                          type="color"
                          value={displayColor}
                          disabled={isBusy}
                          onChange={(event) => void handleColorAssign(candidate, event.target.value)}
                          className="h-7 w-7 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed"
                          title="应用颜色"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleColorAssign(candidate, null)}
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            hasManualColor ? "text-slate-400 hover:text-slate-600" : "text-slate-300"
                          }`}
                          title="恢复默认颜色"
                        >
                          默认
                        </button>
                      </div>

                      <select
                        className="order-1 min-w-[120px] rounded-xl border-none bg-white/90 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-slate-100 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed"
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
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            titleCaptureEnabled
                              ? "text-slate-700 hover:bg-slate-100"
                              : "text-indigo-700 hover:bg-indigo-50"
                          }`}
                          title={titleCaptureEnabled ? "不记录该应用窗口标题" : "恢复记录该应用窗口标题"}
                        >
                          {titleCaptureEnabled ? "记录标题" : "不记标题"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleTrackingToggle(candidate, !trackingEnabled)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            trackingEnabled
                              ? "text-amber-700 hover:bg-amber-50"
                              : "text-emerald-700 hover:bg-emerald-50"
                          }`}
                          title={trackingEnabled ? "将该应用排除出统计" : "恢复该应用进入统计"}
                        >
                          {trackingEnabled ? "统计中" : "不统计"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleResetAppOverride(candidate)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="恢复该应用默认识别"
                        >
                          <RotateCcw size={12} />
                          恢复默认
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteAllSessions(candidate)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-white/70 bg-white/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">分类控制</h3>
                <p className="text-xs text-slate-500">在这里新建分类并调整分类主色</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateCustomCategory()}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  + 新建分类
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryDialog(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
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
