import { Info } from "lucide-react";
import QuietSubpanel from "../../../shared/components/QuietSubpanel";
import type { UpdateSnapshot } from "../../../shared/types/update";
import UpdateStatusPanel from "../../update/components/UpdateStatusPanel";

type SettingsAboutPanelProps = {
  appVersion: string;
  effectiveUpdateSnapshot: UpdateSnapshot;
  updateChecking: boolean;
  updateInstalling: boolean;
  onCheckForUpdates?: () => void;
  onOpenUpdateDialog?: () => void;
  onOpenUpdateReleasePage?: () => void;
  onOpenUpdateDownload?: () => void;
  onOpenReleaseNotes: () => void;
  onOpenFeedback: () => void;
};

export default function SettingsAboutPanel({
  appVersion,
  effectiveUpdateSnapshot,
  updateChecking,
  updateInstalling,
  onCheckForUpdates,
  onOpenUpdateDialog,
  onOpenUpdateReleasePage,
  onOpenUpdateDownload,
  onOpenReleaseNotes,
  onOpenFeedback,
}: SettingsAboutPanelProps) {
  return (
    <section className="qp-panel p-5 md:p-6">
      <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--qp-border-subtle)] mb-5">
        <Info size={16} className="text-[var(--qp-accent-default)]" />
        <h2 className="text-sm font-semibold text-[var(--qp-text-primary)]">关于</h2>
      </div>

      <QuietSubpanel>
        <p className="text-sm font-semibold text-[var(--qp-text-primary)]">应用信息</p>
        <p className="mt-1 text-sm text-[var(--qp-text-secondary)]">
          当前版本：v{appVersion}
        </p>
        <p className="mt-0.5 text-xs text-[var(--qp-text-tertiary)]">
          查看最新发布说明，或提交使用反馈。
        </p>
        <div className="mt-4">
          <UpdateStatusPanel
            snapshot={effectiveUpdateSnapshot}
            checking={updateChecking}
            installing={updateInstalling}
            onCheckUpdates={() => onCheckForUpdates?.()}
            onOpenConfirmDialog={() => onOpenUpdateDialog?.()}
            onOpenUpdateReleasePage={() => onOpenUpdateReleasePage?.()}
            onOpenUpdateDownload={() => onOpenUpdateDownload?.()}
            onOpenReleaseNotes={onOpenReleaseNotes}
            onOpenFeedback={onOpenFeedback}
          />
        </div>
      </QuietSubpanel>
    </section>
  );
}
