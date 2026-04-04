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
import { type HistorySession } from "../lib/db";
import { UI_TEXT } from "../lib/copy";
import {
  formatDuration,
  formatTime,
  formatDateLabel,
  formatChartHours,
} from "../lib/services/history";
import { HistoryService } from "../lib/services/HistoryService";
import { ProcessMapper } from "../lib/ProcessMapper";
import type { TrackerHealthSnapshot } from "../types/tracking";

interface Props {
  icons: Record<string, string>;
  refreshKey?: number;
  refreshIntervalSecs: number;
  mergeThresholdSecs: number;
  minSessionSecs: number;
  trackerHealth: TrackerHealthSnapshot;
}

export default function History({
  icons,
  refreshKey = 0,
  refreshIntervalSecs,
  mergeThresholdSecs,
  minSessionSecs,
  trackerHealth,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [rawDaySessions, setRawDaySessions] = useState<HistorySession[]>([]);
  const [rawWeeklySessions, setRawWeeklySessions] = useState<HistorySession[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const loadData = useCallback(async (showLoading: boolean = false) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const snapshot = await HistoryService.loadHistorySnapshot(selectedDate);

      setRawDaySessions(snapshot.daySessions);
      setRawWeeklySessions(snapshot.weeklySessions);
      setNowMs(snapshot.fetchedAtMs);
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
  const historyView = useMemo(
    () => HistoryService.buildHistoryReadModel({
      daySessions: rawDaySessions,
      weeklySessions: rawWeeklySessions,
      selectedDate,
      nowMs,
      trackerHealth,
      minSessionSecs,
      mergeThresholdSecs,
    }),
    [mergeThresholdSecs, minSessionSecs, nowMs, rawDaySessions, rawWeeklySessions, selectedDate, trackerHealth],
  );
  const {
    timelineSessions,
    appSummary,
    chartData,
    chartAxis,
  } = historyView;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex-1 min-h-0 flex flex-col gap-5 h-full overflow-hidden"
    >
      <header className="glass-card p-5 flex items-center justify-between bg-white/40">
        <div>
          <h1 className="text-2xl font-bold gradient-text">{UI_TEXT.history.title}</h1>
          <p className="text-slate-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Calendar size={13} />
            {formatDateLabel(selectedDate)} · {UI_TEXT.history.sessionCount(timelineSessions.length)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ x: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={() => changeDate(-1)}
            className="p-2.5 rounded-xl glass-card hover:bg-white/70 text-slate-500"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <span className="px-4 py-2 bg-white/60 rounded-xl text-sm font-semibold text-slate-700 min-w-[80px] text-center">
            {formatDateLabel(selectedDate)}
          </span>
          <motion.button
            whileHover={{ x: 1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="p-2.5 rounded-xl glass-card hover:bg-white/70 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </header>

      <div className="flex gap-5 min-h-0 flex-1">
        <div className="w-5/12 flex flex-col gap-5 min-h-0">
          <div className="glass-card p-5 bg-white/30">
            <h3 className="font-bold text-slate-800 text-sm mb-4">{UI_TEXT.history.pastSevenDays}</h3>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f020" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  ticks={chartAxis.ticks}
                  domain={[0, chartAxis.domainMax]}
                  tickFormatter={(value) => formatChartHours(Number(value))}
                />
                <Tooltip
                  formatter={(value) => `${formatChartHours(Number(value))}h`}
                  contentStyle={{ borderRadius: "1rem", border: "none", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
                />
                <Area type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: "#6366f1", r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5 bg-white/30 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="font-bold text-slate-800 text-sm mb-4">{UI_TEXT.history.appDistribution}</h3>
            {appSummary.length === 0 ? (
              <p className="text-slate-400 text-xs text-center mt-8">{UI_TEXT.history.noData}</p>
            ) : (
              <div className="space-y-3">
                {appSummary.slice(0, 15).map((app) => {
                  const mapped = ProcessMapper.map(app.exeName);
                  const appName = app.appName.trim() || mapped.name;
                  return (
                    <div key={app.exeName}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5 min-w-0">
                          {icons[app.exeName] && <img src={icons[app.exeName]} className="w-3.5 h-3.5 object-contain" alt="" />}
                          <span className="truncate">{appName}</span>
                        </span>
                        <span className="text-slate-400">{formatDuration(app.duration)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${app.percentage}%` }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: mapped.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 glass-card p-5 bg-white/30 flex flex-col overflow-hidden min-h-0">
          <h3 className="font-bold text-slate-800 text-sm mb-4">{UI_TEXT.history.timeline}</h3>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{UI_TEXT.history.loading}</div>
          ) : timelineSessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">{UI_TEXT.history.emptyDay}</div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {timelineSessions.map((session) => {
                  const mapped = ProcessMapper.map(session.exe_name);

                  return (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 p-3 bg-white/50 rounded-xl hover:bg-white/80 transition-all group"
                    >
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0"
                        style={{ backgroundColor: mapped.color }}
                      />
                      <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-1.5">
                        {icons[session.exe_name] ? (
                          <img src={icons[session.exe_name]} className="w-full h-full object-contain" alt="" />
                        ) : (
                          <div className="text-[10px] font-bold opacity-30">{mapped.category[0].toUpperCase()}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-xs truncate flex items-center gap-2">
                          {session.displayName}
                          {session.mergedCount > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                              {UI_TEXT.history.mergedCount(session.mergedCount)}
                            </span>
                          )}
                        </div>
                        {session.displayTitle && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {session.displayTitle}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-bold text-indigo-600">{formatDuration(session.duration || 0)}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatTime(session.start_time)}
                          {session.end_time ? ` -> ${formatTime(session.end_time)}` : ` ${UI_TEXT.history.untilNow}`}
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
