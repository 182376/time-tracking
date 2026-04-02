import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2, Clock, RotateCcw, ShieldAlert, Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, loadSettings, saveSetting, clearTodayData } from "../lib/settings";

interface Props {
  onSettingsChanged: (settings: AppSettings) => void;
}

export default function Settings({ onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    loadSettings().then(s => {
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
    
    // sync to backend for AFK timeout
    if (key === "afk_timeout_secs") {
      await invoke("cmd_set_afk_timeout", { timeoutSecs: value });
    }
    
    onSettingsChanged(newSettings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleClearData = async () => {
    if (confirm("Are you sure you want to completely erase all data collected today? This cannot be undone.")) {
      await clearTodayData();
      alert("Today's data has been cleared.");
      window.location.reload();
    }
  };

  if (loading || !settings) {
    return <div className="p-6 text-slate-400">Loading settings...</div>;
  }

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-6 h-full max-w-4xl"
    >
      <header className="glass-card p-6 flex justify-between items-center bg-white/40">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Configure tracking behavior and app preferences</p>
        </div>
        <div className="flex bg-white/60 px-4 py-2 rounded-2xl items-center text-sm font-semibold">
          {saveStatus === "saving" && <span className="text-indigo-500 animate-pulse">Saving...</span>}
          {saveStatus === "saved" && <span className="text-emerald-500 flex items-center gap-1.5"><Save size={14}/> Saved</span>}
          {saveStatus === "idle" && <span className="text-slate-400">Auto-saved</span>}
        </div>
      </header>

      <div className="glass-card p-8 bg-white/30 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8">
        
        {/* Tracking Settings */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-indigo-500" />
            Tracking Rules
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60">
              <div>
                <div className="font-semibold text-slate-700">AFK Timeout (Idle Detection)</div>
                <div className="text-xs text-slate-500 mt-1 max-w-sm">
                  Stop tracking active session if mouse/keyboard has been idle for this long.
                </div>
              </div>
              <select 
                value={settings.afk_timeout_secs}
                onChange={(e) => handleChange("afk_timeout_secs", Number(e.target.value))}
                className="bg-white px-4 py-2 rounded-xl text-sm font-semibold border-none shadow-sm focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
              >
                <option value={60}>1 Minute</option>
                <option value={180}>3 Minutes</option>
                <option value={300}>5 Minutes</option>
                <option value={600}>10 Minutes</option>
                <option value={1800}>30 Minutes</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60">
              <div>
                <div className="font-semibold text-slate-700">Minimum Session Length</div>
                <div className="text-xs text-slate-500 mt-1 max-w-sm">
                  Discard sessions shorter than this to prevent UI noise when Alt+Tabbing.
                </div>
              </div>
              <select 
                value={settings.min_session_secs}
                onChange={(e) => handleChange("min_session_secs", Number(e.target.value))}
                className="bg-white px-4 py-2 rounded-xl text-sm font-semibold border-none shadow-sm focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
              >
                <option value={0}>0 Seconds (Log everything)</option>
                <option value={3}>3 Seconds</option>
                <option value={5}>5 Seconds</option>
                <option value={10}>10 Seconds</option>
              </select>
            </div>
          </div>
        </section>

        {/* UI Settings */}
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <RotateCcw size={18} className="text-indigo-500" />
            Interface Settings
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-white/60">
              <div>
                <div className="font-semibold text-slate-700">Dashboard Refresh Rate</div>
                <div className="text-xs text-slate-500 mt-1 max-w-sm">
                  How often the UI polls the database for stats updates. Lower is smoother but uses more CPU.
                </div>
              </div>
              <select 
                value={settings.refresh_interval_secs}
                onChange={(e) => handleChange("refresh_interval_secs", Number(e.target.value))}
                className="bg-white px-4 py-2 rounded-xl text-sm font-semibold border-none shadow-sm focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer"
              >
                <option value={2}>2 Seconds</option>
                <option value={5}>5 Seconds</option>
                <option value={10}>10 Seconds</option>
                <option value={30}>30 Seconds</option>
              </select>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="mt-4">
          <h2 className="text-lg font-bold text-rose-500 mb-4 flex items-center gap-2">
            <ShieldAlert size={18} />
            Danger Zone
          </h2>
          <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 flex items-center justify-between">
            <div>
              <div className="font-semibold text-rose-900">Clear Today's Data</div>
              <div className="text-xs text-rose-700/70 mt-1">
                Wipe all sessions recorded since midnight today.
              </div>
            </div>
            <button 
              onClick={handleClearData}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-200 transition-colors"
            >
              <Trash2 size={16} />
              Clear Data
            </button>
          </div>
        </section>

      </div>
    </motion.div>
  );
}
