import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2, Clock, ShieldAlert, Save, RefreshCw, Smartphone, Zap } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, clearSessionsBefore, loadSettings, saveSetting } from "../lib/settings";

interface Props {
  onSettingsChanged: (settings: AppSettings) => void;
}

type CleanupRange = 180 | 90 | 60 | 30 | 15 | 7;

const CLEANUP_OPTIONS: Array<{ value: CleanupRange; label: string }> = [
  { value: 180, label: "180 天前" },
  { value: 90, label: "90 天前" },
  { value: 60, label: "60 天前" },
  { value: 30, label: "30 天前" },
  { value: 15, label: "15 天前" },
  { value: 7, label: "7 天前" },
];

function getCutoffTime(range: CleanupRange) {
  const date = new Date();
  date.setDate(date.getDate() - range);
  return date.getTime();
}

export default function Settings({ onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [cleanupRange, setCleanupRange] = useState<CleanupRange>(30);
  const [isCleaning, setIsCleaning] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleChange = async (key: keyof AppSettings, value: number) => {
    if (!settings) return;
    setSaveStatus("saving");

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await saveSetting(key, value);

    if (key === "afk_timeout_secs") {
      await invoke("cmd_set_afk_timeout", { timeoutSecs: value }).catch(console.warn);
    }

    onSettingsChanged(newSettings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleCleanup = async () => {
    const selectedLabel = CLEANUP_OPTIONS.find((option) => option.value === cleanupRange)?.label ?? "所选时间";
    const confirmText = `确定要清理 ${selectedLabel} 及更早的所有记录吗？此操作无法撤销。`;
    if (!window.confirm(confirmText)) return;

    setIsCleaning(true);
    try {
      await clearSessionsBefore(getCutoffTime(cleanupRange));
      window.location.reload();
    } finally {
      setIsCleaning(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 gap-3 animate-pulse">
        <RefreshCw className="animate-spin" size={20} />
        <span className="text-sm font-medium">正在获取配置...</span>
      </div>
    );
  }

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-6 h-full max-w-5xl"
    >
      <header className="glass-card p-6 flex justify-between items-center bg-white/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-inner">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">系统设置</h1>
            <p className="text-slate-500 text-xs mt-0.5">定制你的追踪偏好与数据行为</p>
          </div>
        </div>
        <div className="flex bg-white/60 px-4 py-2 rounded-2xl items-center text-xs font-bold shadow-sm border border-white/40">
          {saveStatus === "saving" && (
            <span className="text-indigo-500 animate-pulse flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              正在保存...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-emerald-500 flex items-center gap-1.5">
              <Save size={14} />
              配置已更新
            </span>
          )}
          {saveStatus === "idle" && <span className="text-slate-400">所有更改将自动同步</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-2 gap-6">
          <section className="glass-card p-6 bg-white/30 flex flex-col gap-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Clock size={16} className="text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-800">追踪策略</h2>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">自动挂机判定 (AFK)</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  超过这个时间未操作时，会把记录截断到阈值前；同一应用在这段时间内切回，也会合并成一条连续时间流。
                </p>
                <select
                  value={settings.afk_timeout_secs}
                  onChange={(e) => handleChange("afk_timeout_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={60}>1 分钟</option>
                  <option value={180}>3 分钟</option>
                  <option value={300}>5 分钟</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">最少记录时长</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  忽略所有时长低于此阈值的零碎会话，保持数据整洁。
                </p>
                <select
                  value={settings.min_session_secs}
                  onChange={(e) => handleChange("min_session_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={30}>30 s</option>
                  <option value={60}>1 分钟</option>
                  <option value={180}>3 分钟</option>
                  <option value={300}>5 分钟</option>
                  <option value={600}>10 分钟</option>
                </select>
              </div>
            </div>
          </section>

          <section className="glass-card p-6 bg-white/30 flex flex-col gap-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Smartphone size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-slate-800">性能与同步</h2>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">UI 刷新频率</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  前端界面从后端拉取最新数据的时间间隔。
                </p>
                <select
                  value={settings.refresh_interval_secs}
                  onChange={(e) => handleChange("refresh_interval_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={1}>实时 (1s)</option>
                  <option value={3}>平衡 (3s)</option>
                  <option value={5}>省电 (5s)</option>
                  <option value={10}>低频 (10s)</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 mt-2">
              <div className="flex gap-2.5 items-start">
                <ShieldAlert size={14} className="text-amber-600 mt-0.5" />
                <p className="text-[10px] leading-relaxed text-amber-800/70 font-medium">
                  较短的刷新频率会增加一定的 CPU 开销。如果你发现界面有些卡顿，建议设置为 5s 及以上。
                </p>
              </div>
            </div>
          </section>

          <section className="col-span-2 glass-card p-6 bg-white/30">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 mb-5">
              <Trash2 size={16} className="text-rose-500" />
              <h2 className="text-sm font-bold text-slate-800">数据管理</h2>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-slate-700">按时间范围清理历史数据</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  删除早于所选天数的记录，例如选择“30 天前”会清理 30 天前及更早的数据。
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <select
                  value={cleanupRange}
                  onChange={(e) => setCleanupRange(Number(e.target.value) as CleanupRange)}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-rose-200 outline-none cursor-pointer"
                >
                  {CLEANUP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <motion.button
                  whileHover={{ scale: isCleaning ? 1 : 1.02, backgroundColor: isCleaning ? undefined : "rgba(244, 63, 94, 0.1)" }}
                  whileTap={{ scale: isCleaning ? 1 : 0.98 }}
                  onClick={handleCleanup}
                  disabled={isCleaning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-100 text-rose-600 font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCleaning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {isCleaning ? "正在清理..." : "立即清理记录"}
                </motion.button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
