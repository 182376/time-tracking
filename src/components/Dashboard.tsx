import { motion } from "framer-motion";
import { Monitor, BarChart3, PieChart as PieIcon, Activity } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis } from "recharts";
import {
  buildTopApplications,
  formatDashboardDuration,
  getTotalTrackedTime,
  buildHourlyActivity,
  buildCategoryDistribution,
} from "../lib/services/dashboard";
import { AppStat } from "../types/app";

interface Props {
  stats: AppStat[];
  todaySessions: any[];
  icons: Record<string, string>;
  isAfk: boolean;
  activeAppName: string | null;
}

export default function Dashboard({ stats, todaySessions, icons, isAfk, activeAppName }: Props) {
  const totalTrackedTime = getTotalTrackedTime(stats);
  const topApplications = buildTopApplications(stats);
  const hourlyActivity = buildHourlyActivity(todaySessions);
  const categoryDist = buildCategoryDistribution(stats);

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-5 h-full overflow-hidden"
    >
      <header className="glass-card p-5 flex justify-between items-center bg-white/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 shadow-inner">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">概览</h1>
            <p className="text-slate-500 text-xs flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${activeAppName ? "bg-emerald-400" : "bg-slate-300"} animate-pulse`} />
              {activeAppName ? `正在追踪: ${activeAppName}` : "静候活动中"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white/60 px-4 py-2 rounded-2xl border border-white/60 shadow-sm">
          <div className={`w-2.5 h-2.5 rounded-full ${isAfk ? "bg-amber-400" : "bg-emerald-400"} animate-pulse`} />
          <span className="text-xs font-bold text-slate-600">
            {isAfk ? "处于挂机状态" : "当前活跃"}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
        
        {/* Statistics Left Column */}
        <div className="col-span-4 flex flex-col gap-5 min-h-0">
          {/* Total Time & Category Pie */}
          <div className="glass-card p-6 bg-white/20 flex flex-col items-center relative overflow-hidden">
             <div className="absolute top-4 left-4 text-slate-400 opacity-20"><PieIcon size={40} /></div>
             <h3 className="w-full text-slate-800 font-bold text-sm mb-4">专注分布</h3>
             <div className="relative w-full aspect-square max-h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryDist} innerRadius="70%" outerRadius="100%" paddingAngle={6} dataKey="value" stroke="none">
                      {categoryDist.map((item, index) => (
                        <Cell key={`cell-${index}`} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(v) => formatDashboardDuration(Number(v))}
                      contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.1)", fontSize: "12px" }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-800 tabular-nums">
                    {formatDashboardDuration(totalTrackedTime)}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">总计</span>
                </div>
             </div>
             <div className="mt-6 w-full space-y-2">
                {categoryDist.map(cat => (
                  <div key={cat.name} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 font-bold text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </div>
                    <span className="text-slate-400 font-medium">{formatDashboardDuration(cat.value)}</span>
                  </div>
                ))}
             </div>
          </div>

          {/* Activity Pulse Chart */}
          <div className="glass-card p-5 bg-white/20 flex-1 min-h-0">
            <h3 className="text-slate-800 font-bold text-sm mb-4 flex items-center gap-2">
              <BarChart3 size={14} className="text-indigo-500" />
              今日能量脉冲
            </h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyActivity}>
                <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={5} />
                <Tooltip 
                  cursor={{ fill: '#e2e8f080' }}
                  formatter={(v) => [`${Math.round(Number(v))}m`, "活跃"]}
                  contentStyle={{ borderRadius: "0.75rem", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontSize: "10px" }}
                />
                <Bar dataKey="minutes" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Apps Right Column */}
        <div className="col-span-8 glass-card p-6 flex flex-col bg-white/30 overflow-hidden min-h-0">
          <header className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 text-base">应用排行</h3>
            <div className="bg-indigo-50 px-3 py-1 rounded-full text-[10px] font-bold text-indigo-600">
              前 {topApplications.length} 位
            </div>
          </header>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {topApplications.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 scale-90">
                <Monitor size={40} className="opacity-20 translate-y-4" />
                <p className="text-sm font-medium mt-4">在这里休息一下吧...</p>
              </div>
            )}
            {topApplications.map((app, index) => (
              <motion.div
                key={app.exeName}
                layout
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-center justify-between p-4 bg-white/40 rounded-2xl border border-transparent hover:border-indigo-100 hover:bg-white/80 transition-all cursor-default group shadow-sm"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div 
                    className="w-11 h-11 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-105 transition-transform overflow-hidden p-2"
                  >
                    {icons[app.exeName] ? (
                      <img src={icons[app.exeName]} className="w-full h-full object-contain" alt="" />
                    ) : (
                      <div className="text-xs font-black opacity-20 text-indigo-900">{app.categoryInitial}</div>
                    )}
                  </div>
                  <div className="truncate">
                    <div className="font-bold text-slate-800 text-sm truncate">{app.name}</div>
                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      占比 {app.percentage}%
                    </div>
                  </div>
                </div>
                
                <div className="text-right ml-4 flex-shrink-0">
                  <div className="font-black text-indigo-600 text-sm tabular-nums">
                    {formatDashboardDuration(app.duration)}
                  </div>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${app.percentage}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
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
