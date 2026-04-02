import { motion } from "framer-motion";
import { Monitor } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  buildFocusShare,
  buildTopApplications,
  formatDashboardDuration,
  getTotalTrackedTime,
} from "../lib/services/dashboard";
import { AppStat } from "../types/app";

interface Props {
  stats: AppStat[];
  icons: Record<string, string>;
  isAfk: boolean;
  activeAppName: string | null;
}

export default function Dashboard({ stats, icons, isAfk, activeAppName }: Props) {
  const totalTrackedTime = getTotalTrackedTime(stats);
  const focusShare = buildFocusShare(stats);
  const topApplications = buildTopApplications(stats);

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-6 h-full"
    >
      <header className="glass-card p-6 flex justify-between items-center bg-white/40">
        <div>
          <h1 className="text-2xl font-bold gradient-text">仪表盘</h1>
          <p className="text-slate-500 text-sm flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activeAppName ? "正在实时追踪" : "等待新的活动..."}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/60 px-4 py-2 rounded-2xl border border-white/60 shadow-sm">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isAfk ? "bg-amber-400" : "bg-emerald-400"
            } animate-pulse`}
          />
          <span className="text-sm font-semibold truncate max-w-[220px]">
            {activeAppName ?? "空闲中"}
          </span>
        </div>
      </header>

      <div className="flex gap-6 h-full min-h-0">
        <div className="w-1/3 glass-card p-8 flex flex-col items-center justify-center bg-white/20">
          <h3 className="w-full text-slate-800 font-bold text-lg mb-4">专注占比</h3>
          <div className="relative w-full aspect-square max-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={focusShare}
                  innerRadius="75%"
                  outerRadius="100%"
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {focusShare.map((item, index) => (
                    <Cell key={`cell-${index}`} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatDashboardDuration(Number(value)), "时长"]}
                  contentStyle={{
                    borderRadius: "1rem",
                    border: "none",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-slate-800 tabular-nums">
                {formatDashboardDuration(totalTrackedTime)}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                总计时长
              </span>
            </div>
          </div>
        </div>

        <div className="w-2/3 glass-card p-6 flex flex-col bg-white/30">
          <h3 className="font-bold text-slate-800 text-lg mb-6">应用排行</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {topApplications.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <Monitor size={40} className="opacity-20" />
                <p className="text-sm">今天还没有记录到活动。</p>
              </div>
            )}
            {topApplications.map((app, index) => (
              <motion.div
                key={app.exeName}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-center justify-between p-4 bg-white/40 rounded-2xl border border-transparent hover:border-indigo-100 hover:bg-white/80 transition-all cursor-default group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform overflow-hidden px-2"
                    style={{ borderLeft: `4px solid ${app.color}` }}
                  >
                    {icons[app.exeName] ? (
                      <img src={icons[app.exeName]} className="w-7 h-7 object-contain" alt="" />
                    ) : (
                      <div className="text-xs font-bold opacity-30">{app.categoryInitial}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{app.name}</div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      占比 {app.percentage}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-indigo-600 tabular-nums">
                    {formatDashboardDuration(app.duration)}
                  </div>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${app.percentage}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: app.color }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
