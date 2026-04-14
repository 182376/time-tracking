import type { UpdateSnapshot } from "../../../shared/types/update";

export interface UpdatePanelActionModel {
  label: string;
  action: "check" | "open_confirm";
  disabled: boolean;
  loading: boolean;
}

export interface UpdateStatusPanelModel {
  statusTitle: string;
  statusDetail: string | null;
  primaryAction: UpdatePanelActionModel;
}

export interface UpdateConfirmDialogModel {
  title: string;
  versionCompareLabel: string;
  confirmLabel: string;
  confirmDescription: string;
  notesPreview: string | null;
}

export function shouldOpenUpdateDialogForSnapshot(snapshot: UpdateSnapshot): boolean {
  return snapshot.status === "available" || snapshot.status === "downloaded";
}

export function shouldShowSidebarUpdateEntry(snapshot: UpdateSnapshot): boolean {
  return snapshot.status === "available" || snapshot.status === "downloaded";
}

function formatVersion(value: string | null): string {
  return `v${value ?? "0.0.0"}`;
}

function getReleaseNotesPreview(releaseNotes: string | null): string | null {
  if (!releaseNotes) return null;
  const trimmed = releaseNotes.trim();
  if (!trimmed) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 220).trimEnd()}...` : trimmed;
}

export function buildUpdateStatusPanelModel(
  snapshot: UpdateSnapshot,
  isChecking: boolean,
  isInstalling: boolean,
): UpdateStatusPanelModel {
  const latestVersion = snapshot.latest_version ? formatVersion(snapshot.latest_version) : null;

  if (snapshot.status === "available") {
    return {
      statusTitle: `发现新版本：${latestVersion ?? "未知版本"}`,
      statusDetail: "新版本已就绪，确认后将先下载更新包。",
      primaryAction: {
        label: "立即下载",
        action: "open_confirm",
        disabled: isInstalling,
        loading: isInstalling,
      },
    };
  }

  if (snapshot.status === "downloaded") {
    return {
      statusTitle: `更新已下载：${latestVersion ?? "未知版本"}`,
      statusDetail: "更新包已下载完成，确认后将重启并安装。",
      primaryAction: {
        label: "重启安装",
        action: "open_confirm",
        disabled: isInstalling,
        loading: isInstalling,
      },
    };
  }

  if (snapshot.status === "downloading") {
    return {
      statusTitle: "正在下载更新...",
      statusDetail: latestVersion ? `目标版本：${latestVersion}` : null,
      primaryAction: {
        label: "处理中...",
        action: "check",
        disabled: true,
        loading: true,
      },
    };
  }

  if (snapshot.status === "installing") {
    return {
      statusTitle: "正在安装更新...",
      statusDetail: latestVersion ? `目标版本：${latestVersion}` : null,
      primaryAction: {
        label: "处理中...",
        action: "check",
        disabled: true,
        loading: true,
      },
    };
  }

  if (snapshot.status === "checking" || isChecking) {
    return {
      statusTitle: "正在检查更新...",
      statusDetail: null,
      primaryAction: {
        label: "检查中...",
        action: "check",
        disabled: true,
        loading: true,
      },
    };
  }

  if (snapshot.status === "up_to_date") {
    return {
      statusTitle: "已是最新版本",
      statusDetail: null,
      primaryAction: {
        label: "检查更新",
        action: "check",
        disabled: isChecking || isInstalling,
        loading: isChecking,
      },
    };
  }

  if (snapshot.status === "error") {
    return {
      statusTitle: "更新失败",
      statusDetail: snapshot.error_message,
      primaryAction: {
        label: "重新检查",
        action: "check",
        disabled: isChecking || isInstalling,
        loading: isChecking,
      },
    };
  }

  return {
    statusTitle: "尚未检查更新",
    statusDetail: null,
    primaryAction: {
      label: "检查更新",
      action: "check",
      disabled: isChecking || isInstalling,
      loading: isChecking,
    },
  };
}

export function buildUpdateConfirmDialogModel(snapshot: UpdateSnapshot): UpdateConfirmDialogModel {
  const currentVersion = formatVersion(snapshot.current_version);
  const latestVersion = formatVersion(snapshot.latest_version ?? snapshot.current_version);
  const isDownloaded = snapshot.status === "downloaded";

  return {
    title: isDownloaded ? "更新已下载" : "发现新版本",
    versionCompareLabel: `${currentVersion} -> ${latestVersion}`,
    confirmLabel: isDownloaded ? "重启安装" : "立即下载",
    confirmDescription: isDownloaded
      ? "更新包已准备好，确认后将重启并完成安装。"
      : "新版本已就绪，确认后将先下载更新包，下载完成后需再次确认安装。",
    notesPreview: getReleaseNotesPreview(snapshot.release_notes),
  };
}
