import { Monitor } from "lucide-react";
import QuietSwitch from "../../../shared/components/QuietSwitch";

type SettingsResidentPanelProps = {
  minimizeToTrayChecked: boolean;
  onMinimizeToTrayChange: (nextChecked: boolean) => void;
  closeToTrayChecked: boolean;
  onCloseToTrayChange: (nextChecked: boolean) => void;
  launchAtLoginChecked: boolean;
  onLaunchAtLoginChange: (nextChecked: boolean) => void;
  startMinimizedChecked: boolean;
  startMinimizedDisabled: boolean;
  onStartMinimizedChange: (nextChecked: boolean) => void;
};

export default function SettingsResidentPanel({
  minimizeToTrayChecked,
  onMinimizeToTrayChange,
  closeToTrayChecked,
  onCloseToTrayChange,
  launchAtLoginChecked,
  onLaunchAtLoginChange,
  startMinimizedChecked,
  startMinimizedDisabled,
  onStartMinimizedChange,
}: SettingsResidentPanelProps) {
  return (
    <section className="qp-panel min-h-[220px] p-5 md:p-6">
      <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--qp-border-subtle)]">
        <Monitor size={16} className="text-[var(--qp-accent-default)]" />
        <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">常驻</h2>
      </div>

      <div className="mt-5 space-y-5">
        <div>
          <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">最小化到托盘</label>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">
              点最小化后，将窗口收进系统托盘。
            </p>
            <QuietSwitch
              checked={minimizeToTrayChecked}
              onChange={onMinimizeToTrayChange}
              ariaLabel="切换最小化到托盘"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">关闭到托盘</label>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">
              点关闭后，隐藏窗口并继续后台运行。
            </p>
            <QuietSwitch
              checked={closeToTrayChecked}
              onChange={onCloseToTrayChange}
              ariaLabel="切换关闭到托盘"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">开机自启动</label>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">
              开启后，系统登录时自动启动应用。
            </p>
            <QuietSwitch
              checked={launchAtLoginChecked}
              onChange={onLaunchAtLoginChange}
              ariaLabel="切换开机自启动"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[var(--qp-text-tertiary)] uppercase tracking-[0.06em]">启动时最小化</label>
          <div className="mt-2 flex items-start justify-between gap-4">
            <p className="text-sm text-[var(--qp-text-secondary)] leading-relaxed">
              仅对自启动生效：启动后直接进托盘。
            </p>
            <QuietSwitch
              checked={startMinimizedChecked}
              disabled={startMinimizedDisabled}
              onChange={onStartMinimizedChange}
              ariaLabel="切换启动时最小化"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
