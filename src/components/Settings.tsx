import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2, Clock, ShieldAlert, Save, RefreshCw, Smartphone, Zap } from "lucide-react";
import { UI_TEXT } from "../lib/copy";
import type { AppSettings } from "../lib/settings";
import { SettingsService } from "../lib/services/SettingsService";

interface Props {
  onSettingsChanged: (settings: AppSettings) => void;
}

type CleanupRange = 180 | 90 | 60 | 30 | 15 | 7;

const CLEANUP_OPTIONS: Array<{ value: CleanupRange; label: string }> = [
  { value: 180, label: UI_TEXT.settings.cleanupRangeLabels[180] },
  { value: 90, label: UI_TEXT.settings.cleanupRangeLabels[90] },
  { value: 60, label: UI_TEXT.settings.cleanupRangeLabels[60] },
  { value: 30, label: UI_TEXT.settings.cleanupRangeLabels[30] },
  { value: 15, label: UI_TEXT.settings.cleanupRangeLabels[15] },
  { value: 7, label: UI_TEXT.settings.cleanupRangeLabels[7] },
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
    SettingsService.load().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleChange = async (key: keyof AppSettings, value: number) => {
    if (!settings) return;
    setSaveStatus("saving");

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    await SettingsService.updateSetting(key, value);

    onSettingsChanged(newSettings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleCleanup = async () => {
    const selectedLabel = CLEANUP_OPTIONS.find((option) => option.value === cleanupRange)?.label
      ?? UI_TEXT.settings.confirmRangeFallback;
    const confirmText = UI_TEXT.settings.confirmCleanup(selectedLabel);
    if (!window.confirm(confirmText)) return;

    setIsCleaning(true);
    try {
      await SettingsService.clearSessionsBefore(getCutoffTime(cleanupRange));
      window.location.reload();
    } finally {
      setIsCleaning(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 gap-3 animate-pulse">
        <RefreshCw className="animate-spin" size={20} />
        <span className="text-sm font-medium">{UI_TEXT.settings.loading}</span>
      </div>
    );
  }

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col gap-6 h-full max-w-5xl"
    >
      <header className="glass-card p-6 flex justify-between items-center bg-white/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-inner">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{UI_TEXT.settings.title}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{UI_TEXT.settings.subtitle}</p>
          </div>
        </div>
        <div className="flex bg-white/60 px-4 py-2 rounded-2xl items-center text-xs font-bold shadow-sm border border-white/40">
          {saveStatus === "saving" && (
            <span className="text-indigo-500 animate-pulse flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              {UI_TEXT.settings.saving}
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-emerald-500 flex items-center gap-1.5">
              <Save size={14} />
              {UI_TEXT.settings.saved}
            </span>
          )}
          {saveStatus === "idle" && <span className="text-slate-400">{UI_TEXT.settings.idle}</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        <div className="grid grid-cols-2 gap-6">
          <section className="glass-card p-6 bg-white/30 flex flex-col gap-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Clock size={16} className="text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-800">{UI_TEXT.settings.tracking}</h2>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{UI_TEXT.settings.afkLabel}</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  {UI_TEXT.settings.afkHint}
                </p>
                <select
                  value={settings.afk_timeout_secs}
                  onChange={(e) => handleChange("afk_timeout_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={60}>{UI_TEXT.settings.minutePresets[60]}</option>
                  <option value={180}>{UI_TEXT.settings.minutePresets[180]}</option>
                  <option value={300}>{UI_TEXT.settings.minutePresets[300]}</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{UI_TEXT.settings.minSessionLabel}</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  {UI_TEXT.settings.minSessionHint}
                </p>
                <select
                  value={settings.min_session_secs}
                  onChange={(e) => handleChange("min_session_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={30}>30 s</option>
                  <option value={60}>{UI_TEXT.settings.minutePresets[60]}</option>
                  <option value={180}>{UI_TEXT.settings.minutePresets[180]}</option>
                  <option value={300}>{UI_TEXT.settings.minutePresets[300]}</option>
                  <option value={600}>{UI_TEXT.settings.minutePresets[600]}</option>
                </select>
              </div>
            </div>
          </section>

          <section className="glass-card p-6 bg-white/30 flex flex-col gap-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Smartphone size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-slate-800">{UI_TEXT.settings.performance}</h2>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{UI_TEXT.settings.refreshLabel}</label>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 leading-relaxed max-w-[220px]">
                  {UI_TEXT.settings.refreshHint}
                </p>
                <select
                  value={settings.refresh_interval_secs}
                  onChange={(e) => handleChange("refresh_interval_secs", Number(e.target.value))}
                  className="bg-white/80 px-3 py-2 rounded-xl text-xs font-bold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                >
                  <option value={1}>{UI_TEXT.settings.refreshPresets[1]}</option>
                  <option value={3}>{UI_TEXT.settings.refreshPresets[3]}</option>
                  <option value={5}>{UI_TEXT.settings.refreshPresets[5]}</option>
                  <option value={10}>{UI_TEXT.settings.refreshPresets[10]}</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 mt-2">
              <div className="flex gap-2.5 items-start">
                <ShieldAlert size={14} className="text-amber-600 mt-0.5" />
                <p className="text-[10px] leading-relaxed text-amber-800/70 font-medium">
                  {UI_TEXT.settings.refreshWarning}
                </p>
              </div>
            </div>
          </section>

          <section className="col-span-2 glass-card p-6 bg-white/30">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 mb-5">
              <Trash2 size={16} className="text-rose-500" />
              <h2 className="text-sm font-bold text-slate-800">{UI_TEXT.settings.cleanup}</h2>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-slate-700">{UI_TEXT.settings.cleanupTitle}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {UI_TEXT.settings.cleanupHint}
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
                  whileHover={isCleaning ? undefined : { y: -1 }}
                  whileTap={isCleaning ? undefined : { scale: 0.99 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  onClick={handleCleanup}
                  disabled={isCleaning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-100 text-rose-600 font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCleaning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  {isCleaning ? UI_TEXT.settings.cleanupRunning : UI_TEXT.settings.cleanupNow}
                </motion.button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
