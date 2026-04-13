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
  title: "发现新版本" | "更新已下载";
  versionCompareLabel: string;
  confirmLabel: "立即更新" | "重启安装";
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
      statusDetail: "新版本已准备好，可以现在下载并安装。",
      primaryAction: {
        label: "立即更新",
        action: "open_confirm",
        disabled: isInstalling,
        loading: isInstalling,
      },
    };
  }

  if (snapshot.status === "downloaded") {
    return {
      statusTitle: `更新已下载：${latestVersion ?? "未知版本"}`,
      statusDetail: "更新已准备安装，重启应用后生效。",
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
        label: "检查中...",
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
        label: "检查中...",
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
      statusTitle: "检查更新失败",
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
    versionCompareLabel: `${currentVersion} → ${latestVersion}`,
    confirmLabel: isDownloaded ? "重启安装" : "立即更新",
    confirmDescription: isDownloaded
      ? "更新已准备安装，确认后将重启并完成安装。"
      : "新版本已准备好，确认后将下载并安装更新。",
    notesPreview: getReleaseNotesPreview(snapshot.release_notes),
  };
}
