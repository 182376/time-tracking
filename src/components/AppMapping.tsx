import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Palette, RefreshCw, Sparkles, Trash2, RotateCcw } from "lucide-react";
import { SettingsService } from "../lib/services/SettingsService";
import { ProcessMapper, type AppOverride } from "../lib/ProcessMapper";
import { buildDangerConfirmMessage } from "../lib/confirm";
import type { ObservedAppCandidate } from "../lib/settings";
import {
  buildCustomCategory,
  isCustomCategory,
  USER_ASSIGNABLE_CATEGORIES,
  type UserAssignableAppCategory,
} from "../lib/config/categoryTokens";
import { useIconThemeColors } from "../hooks/useIconThemeColors";

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
const CREATE_CUSTOM_CATEGORY_VALUE = "__create_custom__";

const APP_COLOR_SWATCHES = [
  "#4F46E5",
  "#2563EB",
  "#0891B2",
  "#10B981",
  "#84CC16",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#7C3AED",
  "#64748B",
];

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
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const iconThemeColors = useIconThemeColors(icons);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [observed, loadedOverrides] = await Promise.all([
          SettingsService.loadObservedAppCandidates(),
          SettingsService.loadAppOverrides(),
        ]);
        if (cancelled) return;
        ProcessMapper.setUserOverrides(loadedOverrides);
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
    const category = overrides[candidate.exeName]?.category ?? mapped.category;
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
    const categories = new Set<UserAssignableAppCategory>();
    for (const override of Object.values(overrides)) {
      if (override.category && isCustomCategory(override.category)) {
        categories.add(override.category);
      }
    }

    return Array.from(categories)
      .sort((a, b) => ProcessMapper.getCategoryLabel(a).localeCompare(ProcessMapper.getCategoryLabel(b), "zh-CN"));
  }, [overrides]);

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

  const handleCategoryAssign = async (candidate: ObservedAppCandidate, categoryValue: string) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    let category: UserAssignableAppCategory | undefined;
    if (categoryValue === AUTO_CATEGORY_VALUE) {
      category = undefined;
    } else if (categoryValue === CREATE_CUSTOM_CATEGORY_VALUE) {
      const customCategoryName = window.prompt("请输入自定义分类名称（最多4个字）", "");
      if (customCategoryName === null) {
        return;
      }

      const normalized = customCategoryName.trim();
      if (!normalized) {
        return;
      }

      category = buildCustomCategory(normalized);
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

  const handleColorAssign = async (candidate: ObservedAppCandidate, colorValue: string) => {
    const current = ProcessMapper.getUserOverride(candidate.exeName);
    const nextOverride = buildOverride({
      category: current?.category,
      displayName: current?.displayName,
      color: colorValue,
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
      buildDangerConfirmMessage("删除应用全部历史记录", `目标应用：${displayName}`),
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
            <h1 className="text-xl font-bold text-slate-800">应用分类与颜色</h1>
            <p className="mt-0.5 text-sm text-slate-500">和概览并列的独立页面，已分类与未分类都可调整</p>
          </div>
        </div>
      </header>

      <section className="glass-card bg-white/25 p-4">
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
              const inputValue = nameDrafts[candidate.exeName] ?? displayName;

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
                        <input
                          value={inputValue}
                          disabled={isBusy}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setNameDrafts((prev) => ({ ...prev, [candidate.exeName]: nextValue }));
                          }}
                          onBlur={() => void handleNameCommit(candidate)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                          className="w-full truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-slate-800 outline-none focus:border-indigo-200 focus:bg-white/85 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed"
                        />
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
                        <input
                          type="color"
                          value={displayColor}
                          disabled={isBusy}
                          onChange={(event) => void handleColorAssign(candidate, event.target.value)}
                          className="h-7 w-7 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed"
                          title="应用颜色"
                        />
                        <div className="flex items-center gap-1">
                          {APP_COLOR_SWATCHES.map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleColorAssign(candidate, swatch)}
                              className="h-3.5 w-3.5 rounded-full border border-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                              style={{
                                backgroundColor: swatch,
                                outline: displayColor === swatch ? "2px solid #334155" : "none",
                              }}
                              title={swatch}
                            />
                          ))}
                        </div>
                      </div>

                      <select
                        className="order-1 min-w-[120px] rounded-xl border-none bg-white/90 px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-slate-100 outline-none cursor-pointer focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed"
                        value={assignedCategory}
                        disabled={isBusy}
                        onChange={(event) => void handleCategoryAssign(candidate, event.target.value)}
                      >
                        <option value={AUTO_CATEGORY_VALUE}>自动识别</option>
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>
                            {ProcessMapper.getCategoryLabel(category)}
                          </option>
                        ))}
                        {customCategoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {ProcessMapper.getCategoryLabel(category)}
                          </option>
                        ))}
                        <option value={CREATE_CUSTOM_CATEGORY_VALUE}>+ 新建分类...</option>
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
                          title="删除该应用全部历史记录"
                        >
                          <Trash2 size={12} />
                          删除全部历史记录
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
    </motion.div>
  );
}
