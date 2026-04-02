import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { getHistoryByDate, getWeeklyStats, HistorySession, DailySummary } from "../lib/db";
import { ProcessMapper } from "../lib/ProcessMapper";

const formatDuration = (ms: number) => {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${minutes}m`;
  return `<1m`;
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

const formatDateLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
};

interface Props {
  icons: Record<string, string>;
}

export default function History({ icons }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [weekly, setWeekly] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        getHistoryByDate(selectedDate),
        getWeeklyStats(),
      ]);
      setSessions(s);
      setWeekly(w);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    if (d <= new Date()) setSelectedDate(d);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Group sessions by app for the summary bar
  const appSummary = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.exe_name] = (acc[s.exe_name] ?? 0) + (s.duration ?? 0);
    return acc;
  }, {});
  const sortedApps = Object.entries(appSummary).sort((a, b) => b[1] - a[1]);
  const totalDay = sortedApps.reduce((acc, [, d]) => acc + d, 0);

  // Chart data: map "YYYY-MM-DD" → ms, fill gaps with 0
  const chartData = weekly.map((d) => ({
    day: d.date.slice(5), // "MM-DD"
    minutes: Math.round(d.total_duration / 60000),
  }));

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-5 h-full overflow-hidden"
    >
      {/* 顶部：日期导航 */}
      <header className="glass-card p-5 flex items-center justify-between bg-white/40">
        <div>
          <h1 className="text-2xl font-bold gradient-text">History</h1>
          <p className="text-slate-500 text-sm flex items-center gap-1.5 mt-0.5">
            <Calendar size={13} />
            {formatDateLabel(selectedDate)} · {sessions.length} sessions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => changeDate(-1)}
            className="p-2.5 rounded-xl glass-card hover:bg-white/70 text-slate-500"
          >
            <ChevronLeft size={18} />
          </motion.button>
          <span className="px-4 py-2 bg-white/60 rounded-xl text-sm font-semibold text-slate-700 min-w-[80px] text-center">
            {formatDateLabel(selectedDate)}
          </span>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="p-2.5 rounded-xl glass-card hover:bg-white/70 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>
      </header>

      <div className="flex gap-5 min-h-0 flex-1">
        {/* 左侧：周趋势 + 日汇总 */}
        <div className="w-5/12 flex flex-col gap-5">
          {/* 7日折线图 */}
          <div className="glass-card p-5 bg-white/30">
            <h3 className="font-bold text-slate-800 text-sm mb-4">近 7 天</h3>
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
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [`${Number(v)}m`, "时长"]}
                  contentStyle={{ borderRadius: "1rem", border: "none", fontSize: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
                />
                <Area type="monotone" dataKey="minutes" stroke="#6366f1" strokeWidth={2} fill="url(#areaGrad)" dot={{ fill: "#6366f1", r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 当日 App 占比 */}
          <div className="glass-card p-5 bg-white/30 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="font-bold text-slate-800 text-sm mb-4">当日分布</h3>
            {sortedApps.length === 0 ? (
              <p className="text-slate-400 text-xs text-center mt-8">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {sortedApps.slice(0, 8).map(([exe, dur]) => {
                  const mapped = ProcessMapper.map(exe);
                  const pct = totalDay > 0 ? (dur / totalDay) * 100 : 0;
                  return (
                    <div key={exe}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          {icons[exe] && <img src={icons[exe]} className="w-3.5 h-3.5 object-contain" alt="" />}
                          {mapped.name}
                        </span>
                        <span className="text-slate-400">{formatDuration(dur)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
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

        {/* 右侧：时间轴 */}
        <div className="flex-1 glass-card p-5 bg-white/30 flex flex-col overflow-hidden">
          <h3 className="font-bold text-slate-800 text-sm mb-4">时间轴</h3>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">加载中...</div>
          ) : sessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">当天暂无记录</div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              <AnimatePresence initial={false}>
                {sessions.map((s, i) => {
                  const mapped = ProcessMapper.map(s.exe_name);
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-3 p-3 bg-white/50 rounded-xl hover:bg-white/80 transition-all group"
                    >
                      {/* 时间条 */}
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0"
                        style={{ backgroundColor: mapped.color }}
                      />
                      {/* icon */}
                      <div
                        className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden"
                      >
                        {icons[s.exe_name] ? (
                          <img src={icons[s.exe_name]} className="w-5 h-5 object-contain" alt="" />
                        ) : (
                          <div className="text-[10px] font-bold opacity-30">{mapped.category[0].toUpperCase()}</div>
                        )}
                      </div>
                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-xs truncate">{mapped.name}</div>
                        {s.window_title && (
                          <div className="text-[10px] text-slate-400 truncate">{s.window_title}</div>
                        )}
                      </div>
                      {/* 时间 */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs font-bold text-indigo-600">{formatDuration(s.duration ?? 0)}</div>
                        <div className="text-[10px] text-slate-400">
                          {formatTime(s.start_time)}
                          {s.end_time ? ` → ${formatTime(s.end_time)}` : " → now"}
                        </div>
                      </div>
                    </motion.div>
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
