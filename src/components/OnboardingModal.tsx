import { useState } from "react";
import { motion } from "framer-motion";
import type { AppSettings, CloseBehavior, MinimizeBehavior } from "../lib/settings";

interface Props {
  initialSettings: AppSettings;
  onComplete: (nextSettings: {
    close_behavior: CloseBehavior;
    minimize_behavior: MinimizeBehavior;
    launch_at_login: boolean;
    start_minimized: boolean;
  }) => Promise<void>;
}

export default function OnboardingModal({ initialSettings, onComplete }: Props) {
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(initialSettings.close_behavior);
  const [minimizeBehavior, setMinimizeBehavior] = useState<MinimizeBehavior>(initialSettings.minimize_behavior);
  const [launchAtLogin, setLaunchAtLogin] = useState(initialSettings.launch_at_login);
  const [startMinimized, setStartMinimized] = useState(initialSettings.start_minimized);
  const [isSaving, setIsSaving] = useState(false);

  const finishOnboarding = async (useCurrentSelection: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onComplete({
        close_behavior: useCurrentSelection ? closeBehavior : initialSettings.close_behavior,
        minimize_behavior: useCurrentSelection ? minimizeBehavior : initialSettings.minimize_behavior,
        launch_at_login: useCurrentSelection ? launchAtLogin : initialSettings.launch_at_login,
        start_minimized: useCurrentSelection ? startMinimized : initialSettings.start_minimized,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 p-6 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="w-full max-w-[620px] rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl"
      >
        <h2 className="text-xl font-bold text-slate-800">首次引导</h2>
        <p className="mt-1 text-sm text-slate-500">
          30 秒完成关键行为选择，后续可在设置页随时调整。
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <label className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="text-xs font-bold text-slate-500">关闭按钮行为</div>
            <select
              value={closeBehavior}
              onChange={(event) => setCloseBehavior(event.target.value as CloseBehavior)}
              className="mt-2 w-full rounded-lg border-none bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-indigo-200"
            >
              <option value="tray">最小化到托盘</option>
              <option value="exit">直接退出</option>
            </select>
          </label>

          <label className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="text-xs font-bold text-slate-500">最小化按钮行为</div>
            <select
              value={minimizeBehavior}
              onChange={(event) => setMinimizeBehavior(event.target.value as MinimizeBehavior)}
              className="mt-2 w-full rounded-lg border-none bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-indigo-200"
            >
              <option value="taskbar">最小化到任务栏</option>
              <option value="tray">最小化到托盘</option>
            </select>
          </label>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="text-xs font-bold text-slate-500">开机自启动</div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">登录系统后自动启动 Time Tracker。</p>
              <button
                type="button"
                onClick={() => setLaunchAtLogin((value) => !value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  launchAtLogin ? "bg-emerald-500" : "bg-slate-300"
                }`}
                aria-label="切换开机自启动"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    launchAtLogin ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">仅在自启动时：启动后直接隐藏到托盘。</p>
              <button
                type="button"
                disabled={!launchAtLogin}
                onClick={() => setStartMinimized((value) => !value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  startMinimized ? "bg-emerald-500" : "bg-slate-300"
                } ${!launchAtLogin ? "cursor-not-allowed opacity-60" : ""}`}
                aria-label="切换启动时最小化"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    startMinimized ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void finishOnboarding(false)}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            使用当前默认
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void finishOnboarding(true)}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:opacity-60"
          >
            {isSaving ? "保存中..." : "保存并开始使用"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
