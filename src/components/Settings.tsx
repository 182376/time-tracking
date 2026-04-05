import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Trash2,
  Clock,
  Save,
  RefreshCw,
  Zap,
  Monitor,
  Database,
} from "lucide-react";
import { UI_TEXT } from "../lib/copy";
import { buildDangerConfirmMessage } from "../lib/confirm";
import type { AppSettings, CloseBehavior, MinimizeBehavior } from "../lib/settings";
import { SettingsService } from "../lib/services/SettingsService";
import type { ToastTone } from "./ToastStack";

interface Props {
  onSettingsChanged: (settings: AppSettings) => void;
  onToast?: (message: string, tone?: ToastTone) => void;
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

export default function Settings({
  onSettingsChanged,
  onToast,
}: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [cleanupRange, setCleanupRange] = useState<CleanupRange>(30);
  const [isCleaning, setIsCleaning] = useState(false);
  const [exportPath, setExportPath] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [diagnosticPath, setDiagnosticPath] = useState("");
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isExportingDiagnostic, setIsExportingDiagnostic] = useState(false);
  const [appVersion, setAppVersion] = useState("-");

  const notify = (message: string, tone: ToastTone = "info") => {
    onToast?.(message, tone);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loadedSettings = await SettingsService.load();
      if (cancelled) return;
      setSettings(loadedSettings);
      setLoading(false);
    };
    void load();
    const loadVersion = async () => {
      try {
        const version = await getVersion();
        if (!cancelled) setAppVersion(version);
      } catch {
        if (!cancelled) setAppVersion("unknown");
      }
    };
    void loadVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return;
    setSaveStatus("saving");

    const newSettings = { ...settings, [key]: value } as AppSettings;
    setSettings(newSettings);
    await SettingsService.updateSetting(key, value);

    onSettingsChanged(newSettings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleCleanup = async () => {
    const selectedLabel = CLEANUP_OPTIONS.find((option) => option.value === cleanupRange)?.label
      ?? UI_TEXT.settings.confirmRangeFallback;
    const confirmText = buildDangerConfirmMessage(
      "清理历史数据",
      `将删除 ${selectedLabel} 及更早的记录。`,
    );
    if (!window.confirm(confirmText)) return;

    setIsCleaning(true);
    try {
      await SettingsService.clearSessionsBefore(getCutoffTime(cleanupRange));
      notify("历史数据已清理。", "success");
      window.location.reload();
    } catch (error) {
      console.error("cleanup failed", error);
      notify("历史数据清理失败，请稍后重试。", "warning");
    } finally {
      setIsCleaning(false);
    }
  };

  const handleExportBackup = async () => {
    if (isExportingBackup) return;

    let targetPath = exportPath.trim();
    try {
      const selected = await SettingsService.pickBackupSaveFile(targetPath || undefined);
      if (!selected) return;
      targetPath = selected;
      setExportPath(selected);
    } catch (error) {
      console.error("pick backup save file failed", error);
      notify("打开保存对话框失败。", "warning");
      return;
    }

    setIsExportingBackup(true);

    try {
      const exportedPath = await SettingsService.exportBackup(targetPath || undefined);
      setExportPath(exportedPath);
      notify(`备份导出成功：${exportedPath}`, "success");
    } catch (error) {
      console.error("export backup failed", error);
      notify("备份导出失败，请检查路径后重试。", "warning");
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (isRestoringBackup) return;

    let normalizedPath = restorePath.trim();
    if (!normalizedPath) {
      try {
        const selected = await SettingsService.pickBackupFile(undefined);
        if (!selected) return;
        normalizedPath = selected;
        setRestorePath(selected);
      } catch (error) {
        console.error("pick backup file failed", error);
        notify("打开文件选择器失败。", "warning");
        return;
      }
    }

    let previewSummary = "";
    try {
      const preview = await SettingsService.previewBackup(normalizedPath);
      if (preview.compatibility_level === "incompatible") {
        notify(`备份不兼容：${preview.compatibility_message}`, "warning");
        return;
      }
      const exportedAt = new Date(preview.exported_at_ms).toLocaleString();
      previewSummary = [
        `备份版本：v${preview.version}（Schema ${preview.schema_version}）`,
        `导出时间：${exportedAt}`,
        `应用版本：${preview.app_version}`,
        `兼容提示：${preview.compatibility_message}`,
        `会话数：${preview.session_count}，设置项：${preview.setting_count}，图标缓存：${preview.icon_cache_count}`,
      ].join("\n");
    } catch (error) {
      console.error("preview backup failed", error);
      notify("备份文件预览失败，无法确认覆盖范围。", "warning");
      return;
    }

    const confirmed = window.confirm(
      buildDangerConfirmMessage(
        "恢复备份",
        `恢复会覆盖当前统计、应用映射和缓存图标。\n目标文件：${normalizedPath}\n\n${previewSummary}`,
      ),
    );
    if (!confirmed) return;

    setIsRestoringBackup(true);
    try {
      await SettingsService.restoreBackup(normalizedPath);
      notify("备份恢复成功，正在刷新界面。", "success");
      window.location.reload();
    } catch (error) {
      console.error("restore backup failed", error);
      notify("备份恢复失败，已自动回滚，不会破坏当前数据。", "warning");
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleExportDiagnosticBundle = async () => {
    if (isExportingDiagnostic || isExportingBackup || isRestoringBackup) return;

    let targetPath = diagnosticPath.trim();
    try {
      const selected = await SettingsService.pickDiagnosticSaveFile(targetPath || undefined);
      if (!selected) return;
      targetPath = selected;
      setDiagnosticPath(selected);
    } catch (error) {
      console.error("pick diagnostic save file failed", error);
      notify("打开诊断包保存对话框失败。", "warning");
      return;
    }

    setIsExportingDiagnostic(true);
    try {
      const exportedPath = await SettingsService.exportDiagnosticBundle(targetPath || undefined);
      setDiagnosticPath(exportedPath);
      notify(`诊断包导出成功：${exportedPath}`, "success");
    } catch (error) {
      console.error("export diagnostic bundle failed", error);
      notify("诊断包导出失败，请稍后重试。", "warning");
    } finally {
      setIsExportingDiagnostic(false);
    }
  };

  const handleOpenReleaseNotes = async () => {
    try {
      await openUrl("https://github.com/182376/time-tracking/releases");
    } catch (error) {
      console.error("open release notes failed", error);
      notify("无法打开更新说明链接。", "warning");
    }
  };

  const handleOpenFeedback = async () => {
    try {
      await openUrl("https://github.com/182376/time-tracking/issues/new/choose");
    } catch (error) {
      console.error("open feedback link failed", error);
      notify("无法打开反馈链接。", "warning");
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
      className="flex h-full w-full min-w-0 flex-col gap-6"
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

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 gap-6">
          <section className="glass-card min-h-[240px] bg-white/30 p-6">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Clock size={16} className="text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-800">追踪</h2>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{UI_TEXT.settings.afkLabel}</label>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">{UI_TEXT.settings.afkHint}</p>
                  <select
                    value={settings.afk_timeout_secs}
                    onChange={(e) => void handleChange("afk_timeout_secs", Number(e.target.value))}
                    className="bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                  >
                    <option value={60}>{UI_TEXT.settings.minutePresets[60]}</option>
                    <option value={180}>{UI_TEXT.settings.minutePresets[180]}</option>
                    <option value={300}>{UI_TEXT.settings.minutePresets[300]}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">{UI_TEXT.settings.minSessionLabel}</label>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">{UI_TEXT.settings.minSessionHint}</p>
                  <select
                    value={settings.min_session_secs}
                    onChange={(e) => void handleChange("min_session_secs", Number(e.target.value))}
                    className="bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                  >
                    <option value={30}>30 s</option>
                    <option value={60}>{UI_TEXT.settings.minutePresets[60]}</option>
                    <option value={180}>{UI_TEXT.settings.minutePresets[180]}</option>
                    <option value={300}>{UI_TEXT.settings.minutePresets[300]}</option>
                    <option value={600}>{UI_TEXT.settings.minutePresets[600]}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">暂停追踪</label>
                <div className="mt-2 flex items-start justify-between gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    暂停后不再写入新记录，恢复后继续计时。
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleChange("tracking_paused", !settings.tracking_paused)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.tracking_paused ? "bg-amber-500" : "bg-slate-300"
                    }`}
                    aria-label="切换暂停追踪"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.tracking_paused ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="glass-card min-h-[220px] bg-white/30 p-6">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <Monitor size={16} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-slate-800">常驻</h2>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">最小化按钮行为</label>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    点最小化后，选择去任务栏或托盘。
                  </p>
                  <select
                    value={settings.minimize_behavior}
                    onChange={(e) => void handleChange("minimize_behavior", e.target.value as MinimizeBehavior)}
                    className="bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-emerald-200 outline-none cursor-pointer"
                  >
                    <option value="taskbar">最小化到任务栏</option>
                    <option value="tray">最小化到托盘</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">关闭按钮行为</label>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    点关闭后，选择直接退出或隐藏到托盘。
                  </p>
                  <select
                    value={settings.close_behavior}
                    onChange={(e) => void handleChange("close_behavior", e.target.value as CloseBehavior)}
                    className="bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-emerald-200 outline-none cursor-pointer"
                  >
                    <option value="tray">最小化到托盘</option>
                    <option value="exit">直接退出</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">开机自启动</label>
                <div className="mt-2 flex items-start justify-between gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    开启后，系统登录时自动启动应用。
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleChange("launch_at_login", !settings.launch_at_login)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.launch_at_login ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                    aria-label="切换开机自启动"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.launch_at_login ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">启动时最小化</label>
                <div className="mt-2 flex items-start justify-between gap-4">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    仅对自启动生效：启动后直接进托盘。
                  </p>
                  <button
                    type="button"
                    disabled={!settings.launch_at_login}
                    onClick={() => void handleChange("start_minimized", !settings.start_minimized)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.start_minimized ? "bg-emerald-500" : "bg-slate-300"
                    } ${!settings.launch_at_login ? "cursor-not-allowed opacity-60" : ""}`}
                    aria-label="切换启动时最小化"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.start_minimized ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="glass-card p-6 bg-white/30">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 mb-5">
              <Database size={16} className="text-rose-500" />
              <h2 className="text-sm font-bold text-slate-800">数据安全</h2>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-100 bg-white/60 p-4">
                <p className="text-sm font-bold text-slate-700">导出备份 / 恢复备份</p>
                <p className="mt-1 text-sm text-slate-500">
                  备份内容包含会话数据、设置项和图标缓存。恢复会覆盖当前数据。
                </p>
                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-xs font-bold text-slate-600">导出备份</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleExportBackup()}
                        disabled={isExportingBackup || isRestoringBackup}
                        className="rounded-xl border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {isExportingBackup ? "导出中..." : "导出备份"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white/70 p-3">
                    <p className="text-xs font-bold text-slate-600">恢复备份</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRestoreBackup()}
                        disabled={isExportingBackup || isRestoringBackup}
                        className="rounded-xl border border-amber-100 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {isRestoringBackup ? "恢复中..." : "从备份恢复"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/60 p-4">
                <p className="text-sm font-bold text-slate-700">诊断包导出</p>
                <p className="mt-1 text-sm text-slate-500">
                  导出排障所需的关键设置、运行状态和最近会话样本。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportDiagnosticBundle()}
                    disabled={isExportingDiagnostic || isExportingBackup || isRestoringBackup}
                    className="rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                  >
                    {isExportingDiagnostic ? "导出中..." : "导出诊断包"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/60 p-4">
                <p className="text-sm font-bold text-slate-700">发布信息</p>
                <p className="mt-1 text-sm text-slate-500">当前版本：v{appVersion}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleOpenReleaseNotes()}
                    className="rounded-xl border border-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    更新说明
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenFeedback()}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    问题反馈
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/60 p-4">
                <p className="text-sm font-bold text-slate-700">{UI_TEXT.settings.cleanupTitle}</p>
                <p className="mt-1 text-sm text-slate-500">{UI_TEXT.settings.cleanupHint}</p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    value={cleanupRange}
                    onChange={(e) => setCleanupRange(Number(e.target.value) as CleanupRange)}
                    className="bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold border-none shadow-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-rose-200 outline-none cursor-pointer"
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-100 text-rose-600 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCleaning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {isCleaning ? UI_TEXT.settings.cleanupRunning : UI_TEXT.settings.cleanupNow}
                  </motion.button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
