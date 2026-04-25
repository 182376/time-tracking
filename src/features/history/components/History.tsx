import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Clock, Minus, Plus } from "lucide-react";
import { type HistorySession } from "../../../shared/lib/sessionReadRepository";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import {
  formatDuration,
  formatTime,
  formatDateLabel,
  formatChartHours,
} from "../services/historyFormatting";
import { useIconThemeColors } from "../../../shared/hooks/useIconThemeColors";
import {
  buildHistoryReadModel,
  type HistorySnapshot,
} from "../services/historyReadModel";
import type { TrackerHealthSnapshot } from "../../../shared/types/tracking";
import { AppClassification } from "../../../shared/classification/appClassification.ts";
import QuietChartTooltip from "../../../shared/components/QuietChartTooltip";
import QuietPageHeader from "../../../shared/components/QuietPageHeader";
import {
  getHistorySnapshotCache,
  setHistorySnapshotCache,
} from "../services/historySnapshotCache";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
  refreshIntervalSecs: number;
  mergeThresholdSecs: number;
  minSessionSecs: number;
  onMinSessionSecsChange?: (value: number) => void;
  trackerHealth: TrackerHealthSnapshot;
  loadHistorySnapshot: (date: Date, rollingDayCount?: number) => Promise<HistorySnapshot>;
  mappingVersion?: number;
}

const TIMELINE_MIN_SESSION_MINUTES_RANGE = { min: 1, max: 10 } as const;
const clampMinute = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function History({
  icons,
  refreshKey = 0,
  refreshIntervalSecs,
  mergeThresholdSecs,
  minSessionSecs,
  onMinSessionSecsChange,
  trackerHealth,
  loadHistorySnapshot,
  mappingVersion = 0,
}: Props) {
  const initialDate = new Date();
  const initialCachedSnapshot = getHistorySnapshotCache(initialDate);
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
    const cachedSnapshot = getHistorySnapshotCache(selectedDate);

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
      const snapshot = await loadHistorySnapshot(selectedDate);
      setHistorySnapshotCache(snapshot, selectedDate);

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
  }, [loadHistorySnapshot, selectedDate]);

  useEffect(() => {
    void loadData(!hasLoadedRef.current);
  }, [loadData, refreshKey]);

  useEffect(() => {
    const hasLiveSession = rawDaySessions.some((session) => session.endTime === null)
      || rawWeeklySessions.some((session) => session.endTime === null);

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
    () => buildHistoryReadModel({
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

  const minSessionMinutes = clampMinute(
    Math.max(1, Math.round(minSessionSecs / 60)),
    TIMELINE_MIN_SESSION_MINUTES_RANGE.min,
    TIMELINE_MIN_SESSION_MINUTES_RANGE.max,
  );
  const canDecreaseMinSession = minSessionMinutes > TIMELINE_MIN_SESSION_MINUTES_RANGE.min;
  const canIncreaseMinSession = minSessionMinutes < TIMELINE_MIN_SESSION_MINUTES_RANGE.max;
  const updateMinSessionMinutes = (nextMinutes: number) => {
    const clampedMinutes = clampMinute(
      nextMinutes,
      TIMELINE_MIN_SESSION_MINUTES_RANGE.min,
      TIMELINE_MIN_SESSION_MINUTES_RANGE.max,
    );
    onMinSessionSecsChange?.(clampedMinutes * 60);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 md:gap-5 h-full overflow-hidden">
      <QuietPageHeader
        icon={<Clock size={18} />}
        title={UI_TEXT.history.title}
        subtitle={`${formatDateLabel(selectedDate)} · ${UI_TEXT.history.sessionCount(timelineSessions.length)}`}
        rightSlot={(
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
        )}
      />

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
                  <QuietChartTooltip formatter={(value) => `${formatChartHours(Number(value))}h`} />
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
                  {appSummary.map((app) => {
                    const mapped = AppClassification.mapApp(app.exeName, { appName: app.appName });
                    const overrideColor = AppClassification.getUserOverride(app.exeName)?.color;
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
            <div className="flex max-w-[124px] items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => updateMinSessionMinutes(minSessionMinutes - 1)}
                disabled={!canDecreaseMinSession}
                aria-label="减少最少时长 1 分钟"
                className="qp-button-secondary inline-flex h-6 w-6 items-center justify-center rounded-[6px] p-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Minus size={11} />
              </button>
              <span className="min-w-[62px] text-center text-xs font-medium tabular-nums text-[var(--qp-text-secondary)]">
                {minSessionMinutes} 分钟
              </span>
              <button
                type="button"
                onClick={() => updateMinSessionMinutes(minSessionMinutes + 1)}
                disabled={!canIncreaseMinSession}
                aria-label="增加最少时长 1 分钟"
                className="qp-button-secondary inline-flex h-6 w-6 items-center justify-center rounded-[6px] p-0 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] text-sm">{UI_TEXT.history.loading}</div>
          ) : timelineSessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[var(--qp-text-tertiary)] text-sm">{UI_TEXT.history.emptyDay}</div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {timelineSessions.map((session) => {
                  const mapped = AppClassification.mapApp(session.exeName, { appName: session.displayName });
                  const overrideColor = AppClassification.getUserOverride(session.exeName)?.color;
                  const accentColor = overrideColor ?? iconThemeColors[session.exeName] ?? mapped.color;

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
                        {icons[session.exeName] ? (
                          <img src={icons[session.exeName]} className="w-full h-full object-contain" alt="" />
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
                          {formatTime(session.startTime)}
                          {session.endTime ? ` - ${formatTime(session.endTime)}` : ` ${UI_TEXT.history.untilNow}`}
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
    </div>
  );
}
