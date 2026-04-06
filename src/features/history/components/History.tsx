import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { type HistorySession } from "../../../shared/lib/sessionReadRepository";
import { UI_TEXT } from "../../../lib/copy";
import {
  formatDuration,
  formatTime,
  formatDateLabel,
  formatChartHours,
} from "../services/historyFormatting";
import { useIconThemeColors } from "../../../shared/hooks/useIconThemeColors";
import { HistoryReadModelService } from "../../../shared/lib/historyReadModelService";
import type { TrackerHealthSnapshot } from "../../../types/tracking";
import { AppClassificationFacade } from "../../../shared/lib/appClassificationFacade";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
  refreshIntervalSecs: number;
  mergeThresholdSecs: number;
  minSessionSecs: number;
  onMinSessionSecsChange?: (value: number) => void;
  trackerHealth: TrackerHealthSnapshot;
  mappingVersion?: number;
}

interface HistorySnapshotCacheItem {
  daySessions: HistorySession[];
  weeklySessions: HistorySession[];
  fetchedAtMs: number;
}

const HISTORY_SNAPSHOT_CACHE = new Map<string, HistorySnapshotCacheItem>();
const TIMELINE_MIN_SESSION_OPTIONS = [
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 180, label: "3m" },
  { value: 300, label: "5m" },
  { value: 600, label: "10m" },
] as const;

function formatHistoryCacheKey(date: Date) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
}

export default function History({
  icons,
  refreshKey = 0,
  refreshIntervalSecs,
  mergeThresholdSecs,
  minSessionSecs,
  onMinSessionSecsChange,
  trackerHealth,
  mappingVersion = 0,
}: Props) {
  const initialDate = new Date();
  const initialCacheKey = formatHistoryCacheKey(initialDate);
  const initialCachedSnapshot = HISTORY_SNAPSHOT_CACHE.get(initialCacheKey);
  const iconThemeColors = useIconThemeColors(icons);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [rawDaySessions, setRawDaySessions] = useState<HistorySession[]>(
    () => initialCachedSnapshot?.daySessions ?? [],
  );
  const [rawWeeklySessions, setRawWeeklySessions] = useState<HistorySession[]>(
    () => initialCachedSnapshot?.weeklySessions ?? [],
  );
  const [nowMs, setNowMs] = useState(() => initialCachedSnapshot?.fetchedAtMs ?? Date.now());
  const [loading, setLoading] = useState(!initialCachedSnapshot);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(Boolean(initialCachedSnapshot));
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async (showLoading: boolean = false) => {
    const cacheKey = formatHistoryCacheKey(selectedDate);
    const cachedSnapshot = HISTORY_SNAPSHOT_CACHE.get(cacheKey);

    if (cachedSnapshot) {
      setRawDaySessions(cachedSnapshot.daySessions);
      setRawWeeklySessions(cachedSnapshot.weeklySessions);
      setNowMs(cachedSnapshot.fetchedAtMs);
      setHasFetchedOnce(true);
      setLoading(false);
    }

    if (showLoading) {
      setLoading(!cachedSnapshot);
    }

    try {
      const snapshot = await HistoryReadModelService.loadHistorySnapshot(selectedDate);
      HISTORY_SNAPSHOT_CACHE.set(cacheKey, {
        daySessions: snapshot.daySessions,
        weeklySessions: snapshot.weeklySessions,
        fetchedAtMs: snapshot.fetchedAtMs,
      });

      setRawDaySessions(snapshot.daySessions);
      setRawWeeklySessions(snapshot.weeklySessions);
      setNowMs(snapshot.fetchedAtMs);
      setHasFetchedOnce(true);
      hasLoadedRef.current = true;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadData(!hasLoadedRef.current);
  }, [loadData, refreshKey]);

  useEffect(() => {
    const hasLiveSession = rawDaySessions.some((session) => session.end_time === null)
      || rawWeeklySessions.some((session) => session.end_time === null);

    if (!hasLiveSession || trackerHealth.status !== "healthy") {
      return;
    }

    // Keep live durations moving locally so the UI stays fresh without
    // refetching the selected day and weekly range on every timer tick.
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, refreshIntervalSecs * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [rawDaySessions, rawWeeklySessions, refreshIntervalSecs, trackerHealth.status]);

  const changeDate = (delta: number) => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + delta);
    if (nextDate <= new Date()) {
      setSelectedDate(nextDate);
    }
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const showInitialLoading = loading && !hasFetchedOnce;
  const historyView = useMemo(
    () => HistoryReadModelService.buildHistoryReadModel({
      daySessions: rawDaySessions,
      weeklySessions: rawWeeklySessions,
      selectedDate,
      nowMs,
      trackerHealth,
      minSessionSecs,
      mergeThresholdSecs,
    }),
    [mappingVersion, mergeThresholdSecs, minSessionSecs, nowMs, rawDaySessions, rawWeeklySessions, selectedDate, trackerHealth],
  );
  const {
    timelineSessions,
    appSummary,
    chartData,
    chartAxis,
  } = historyView;

  const handleMinSessionChange = (value: string) => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    onMinSessionSecsChange?.(nextValue);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col gap-4 md:gap-5 h-full overflow-hidden"
    >
      <header className="qp-panel px-4 py-3 md:px-5 md:py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.1rem] font-semibold text-[var(--qp-text-primary)]">{UI_TEXT.history.title}</h1>
          <p className="text-[11px] text-[var(--qp-text-tertiary)] flex items-center gap-1.5 mt-1">
            <Calendar size={13} />
            {formatDateLabel(selectedDate)} · {UI_TEXT.history.sessionCount(timelineSessions.length)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <motion.button
            whileTap={{ scale: 0.995 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            onClick={() => changeDate(-1)}
            className="qp-control w-9 h-9 !min-h-0 flex items-center justify-center text-[var(--qp-text-secondary)] hover:text-[var(--qp-text-primary)]"
          >
            <ChevronLeft size={16} />
          </motion.button>
          <span className="qp-status px-3 py-1.5 text-xs font-semibold text-[var(--qp-text-secondary)] min-w-[102px] text-center">
            {formatDateLabel(selectedDate)}
          </span>
          <motion.button
            whileTap={{ scale: 0.995 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="qp-control w-9 h-9 !min-h-0 flex items-center justify-center text-[var(--qp-text-secondary)] hover:text-[var(--qp-text-primary)] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </motion.button>
        </div>
      </header>

      <div className="flex gap-4 md:gap-5 min-h-0 flex-1">
        <div className="w-5/12 flex flex-col gap-4 md:gap-5 min-h-0">
          <div className="qp-panel p-5">
            <h3 className="font-semibold text-[var(--qp-text-primary)] text-sm mb-4">{UI_TEXT.history.pastSevenDays}</h3>
            {showInitialLoading ? (
              <div className="h-[120px] flex items-center justify-center text-[var(--qp-text-tertiary)] text-xs">
                {UI_TEXT.history.loading}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ top: 4, right: 15, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 168, 186, 0.25)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "var(--qp-text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--qp-text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    ticks={chartAxis.ticks}
                    domain={[0, chartAxis.domainMax]}
                    tickFormatter={(value) => formatChartHours(Number(value))}
                  />
                  <Tooltip
                    formatter={(value) => `${formatChartHours(Number(value))}h`}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid var(--qp-border-subtle)",
                      background: "var(--qp-bg-panel)",
                      color: "var(--qp-text-primary)",
                      fontSize: 11,
                      boxShadow: "0 8px 20px rgba(17, 24, 39, 0.08)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="var(--qp-accent-default)"
                    strokeWidth={2}
                    fill="var(--qp-accent-default)"
                    fillOpacity={0.12}
                    dot={{ fill: "var(--qp-accent-default)", r: 2.5 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="qp-panel p-5 flex-1 min-h-0 flex flex-col">
            <div className="mb-4">
              <h3 className="font-semibold text-[var(--qp-text-primary)] text-sm">{UI_TEXT.history.appDistribution}</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pt-2">
              {showInitialLoading ? (
                <p className="text-[var(--qp-text-tertiary)] text-xs text-center mt-8">{UI_TEXT.history.loading}</p>
              ) : appSummary.length === 0 ? (
                <p className="text-[var(--qp-text-tertiary)] text-xs text-center mt-8">{UI_TEXT.history.noData}</p>
              ) : (
                <div className="space-y-4">
                  {appSummary.slice(0, 15).map((app) => {
                    const mapped = AppClassificationFacade.mapApp(app.exeName, { appName: app.appName });
                    const overrideColor = AppClassificationFacade.getUserOverride(app.exeName)?.color;
                    const accentColor = overrideColor ?? iconThemeColors[app.exeName] ?? mapped.color;
                    const appName = app.appName.trim() || mapped.name;
                    return (
                      <div key={app.exeName} className="space-y-1.5">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-[var(--qp-text-secondary)] flex items-center gap-1.5 min-w-0">
                            {icons[app.exeName] && <img src={icons[app.exeName]} className="w-3.5 h-3.5 object-contain" alt="" />}
                            <span className="truncate">{appName}</span>
                          </span>
                          <span className="text-[var(--qp-text-tertiary)] tabular-nums">{formatDuration(app.duration)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--qp-track-muted)] rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${app.percentage}%` }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: accentColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 qp-panel p-5 flex flex-col overflow-hidden min-h-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-[var(--qp-text-primary)] text-sm">{UI_TEXT.history.timeline}</h3>
            <select
              value={minSessionSecs}
              onChange={(event) => handleMinSessionChange(event.target.value)}
              className="qp-control h-8 !min-h-0 min-w-[68px] rounded-[8px] px-2 text-[11px] font-semibold text-[var(--qp-text-secondary)] outline-none"
              aria-label="专注时间流最少时长"
            >
              {TIMELINE_MIN_SESSION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] text-sm">{UI_TEXT.history.loading}</div>
          ) : timelineSessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] text-sm">{UI_TEXT.history.emptyDay}</div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {timelineSessions.map((session) => {
                  const mapped = AppClassificationFacade.mapApp(session.exe_name, { appName: session.displayName });
                  const overrideColor = AppClassificationFacade.getUserOverride(session.exe_name)?.color;
                  const accentColor = overrideColor ?? iconThemeColors[session.exe_name] ?? mapped.color;

                  return (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 p-3 border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-elevated)] rounded-[10px] hover:border-[var(--qp-border-strong)] hover:bg-[var(--qp-bg-panel)] transition-colors"
                    >
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0"
                        style={{ backgroundColor: accentColor }}
                      />
                      <div className="w-8 h-8 rounded-[8px] bg-[var(--qp-bg-panel)] border border-[var(--qp-border-subtle)] flex items-center justify-center flex-shrink-0 overflow-hidden p-1.5">
                        {icons[session.exe_name] ? (
                          <img src={icons[session.exe_name]} className="w-full h-full object-contain" alt="" />
                        ) : (
                          <div className="text-[10px] font-semibold opacity-35 text-[var(--qp-text-secondary)]">{mapped.category[0].toUpperCase()}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[var(--qp-text-primary)] text-xs truncate flex items-center gap-2">
                          {session.displayName}
                          {session.mergedCount > 1 && (
                            <span className="px-1.5 py-0.5 rounded-[6px] border border-[var(--qp-border-subtle)] bg-[var(--qp-bg-panel)] text-[var(--qp-text-secondary)] text-[9px] font-semibold">
                              {UI_TEXT.history.mergedCount(session.mergedCount)}
                            </span>
                          )}
                        </div>
                        {session.displayTitle && (
                          <div className="text-[10px] text-[var(--qp-text-tertiary)] truncate mt-0.5">
                            {session.displayTitle}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-semibold text-[var(--qp-text-primary)] tabular-nums">{formatDuration(session.duration || 0)}</div>
                        <div className="text-[10px] text-[var(--qp-text-tertiary)] mt-0.5 tabular-nums">
                          {formatTime(session.start_time)}
                          {session.end_time ? ` - ${formatTime(session.end_time)}` : ` ${UI_TEXT.history.untilNow}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}


