import type { UpdateErrorStage, UpdateSnapshot } from "../../../shared/types/update";

export type UpdateAction =
  | "check"
  | "open_confirm"
  | "open_release_page"
  | "open_download_url";

export interface UpdateActionModel {
  label: string;
  action: UpdateAction;
  disabled: boolean;
  loading: boolean;
  emphasis?: "primary" | "secondary";
}

export interface UpdateProgressModel {
  percent: number | null;
  label: string;
  valueText: string | null;
  indeterminate: boolean;
}

export interface UpdateStatusPanelModel {
  statusTitle: string;
  statusDetail: string | null;
  primaryAction: UpdateActionModel;
  secondaryAction: UpdateActionModel | null;
  progress: UpdateProgressModel | null;
}

export interface UpdateConfirmDialogModel {
  title: string;
  versionCompareLabel: string;
  confirmDescription: string;
  notesPreview: string | null;
  progress: UpdateProgressModel | null;
  primaryAction: UpdateActionModel | null;
  secondaryAction: UpdateActionModel | null;
}

export function shouldOpenUpdateDialogForSnapshot(snapshot: UpdateSnapshot): boolean {
  return snapshot.status === "available"
    || snapshot.status === "downloaded"
    || snapshot.status === "downloading"
    || snapshot.status === "installing"
    || (snapshot.status === "error" && snapshot.error_stage !== null && Boolean(
      snapshot.release_page_url || snapshot.asset_download_url || snapshot.latest_version,
    ));
}

export function shouldShowSidebarUpdateEntry(snapshot: UpdateSnapshot): boolean {
  return shouldOpenUpdateDialogForSnapshot(snapshot);
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

function formatByteCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let next = value;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  const digits = next >= 100 || unitIndex === 0 ? 0 : 1;
  return `${next.toFixed(digits)} ${units[unitIndex]}`;
}

function summarizeErrorMessage(message: string | null): string | null {
  if (!message) return null;
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 180).trimEnd()}...` : trimmed;
}

function buildErrorDetail(
  stage: UpdateErrorStage | null,
  errorMessage: string | null,
): string | null {
  const summary = summarizeErrorMessage(errorMessage);
  const prefix = stage === "check"
    ? "无法访问更新清单。你可以稍后重试，或直接转到手动下载。"
    : stage === "download"
      ? "已经发现新版本，但自动下载安装包失败。你可以直接转到手动下载。"
      : stage === "install"
        ? "更新包已经准备好，但安装没有完成。你可以重新尝试安装，或重新下载安装包。"
        : "更新流程未能完成。你可以稍后重试。";

  return summary ? `${prefix} 详细信息：${summary}` : prefix;
}

function buildUpdateProgressModel(snapshot: UpdateSnapshot): UpdateProgressModel | null {
  const downloadedBytes = snapshot.downloaded_bytes;
  const totalBytes = snapshot.total_bytes;
  const hasDownloadedBytes = typeof downloadedBytes === "number" && Number.isFinite(downloadedBytes);
  const hasTotalBytes = typeof totalBytes === "number" && Number.isFinite(totalBytes) && totalBytes > 0;
  const percent = hasDownloadedBytes && hasTotalBytes
    ? Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
    : null;

  if (snapshot.status === "downloading") {
    return {
      percent,
      label: hasDownloadedBytes && hasTotalBytes
        ? `${formatByteCount(downloadedBytes)} / ${formatByteCount(totalBytes)}`
        : hasDownloadedBytes
          ? `已下载 ${formatByteCount(downloadedBytes)}`
          : "正在获取进度",
      valueText: percent !== null ? `${percent}%` : null,
      indeterminate: percent === null,
    };
  }

  if (snapshot.status === "downloaded") {
    return {
      percent: 100,
      label: hasDownloadedBytes ? `更新包 ${formatByteCount(downloadedBytes)} 已下载完成` : "更新包已下载完成",
      valueText: "100%",
      indeterminate: false,
    };
  }

  if (snapshot.status === "installing") {
    return {
      percent: 100,
      label: "正在安装更新，应用将很快重启",
      valueText: null,
      indeterminate: true,
    };
  }

  return null;
}

function buildOpenReleaseAction(snapshot: UpdateSnapshot, label = "手动下载"): UpdateActionModel | null {
  if (!snapshot.release_page_url) return null;
  return {
    label,
    action: "open_release_page",
    disabled: false,
    loading: false,
    emphasis: "secondary",
  };
}

function buildOpenDownloadAction(snapshot: UpdateSnapshot, label = "下载安装包"): UpdateActionModel | null {
  if (!snapshot.asset_download_url) return null;
  return {
    label,
    action: "open_download_url",
    disabled: false,
    loading: false,
    emphasis: "primary",
  };
}

export function buildUpdateStatusPanelModel(
  snapshot: UpdateSnapshot,
  isChecking: boolean,
  isInstalling: boolean,
): UpdateStatusPanelModel {
  const latestVersion = snapshot.latest_version ? formatVersion(snapshot.latest_version) : null;
  const progress = buildUpdateProgressModel(snapshot);

  if (snapshot.status === "available") {
    return {
      statusTitle: `发现新版本：${latestVersion ?? "未知版本"}`,
      statusDetail: "新版本已就绪，确认后将先下载更新包。",
      primaryAction: {
        label: "立即下载",
        action: "open_confirm",
        disabled: isInstalling,
        loading: isInstalling,
        emphasis: "primary",
      },
      secondaryAction: null,
      progress,
    };
  }

  if (snapshot.status === "downloaded") {
    return {
      statusTitle: `更新已下载：${latestVersion ?? "未知版本"}`,
      statusDetail: "更新包已准备完成，确认后将重启并安装。",
      primaryAction: {
        label: "重启安装",
        action: "open_confirm",
        disabled: isInstalling,
        loading: isInstalling,
        emphasis: "primary",
      },
      secondaryAction: buildOpenDownloadAction(snapshot, "重新下载安装包"),
      progress,
    };
  }

  if (snapshot.status === "downloading") {
    return {
      statusTitle: "正在下载更新...",
      statusDetail: latestVersion ? `目标版本：${latestVersion}` : "正在准备安装所需的更新包。",
      primaryAction: {
        label: "处理中...",
        action: "check",
        disabled: true,
        loading: true,
        emphasis: "primary",
      },
      secondaryAction: buildOpenReleaseAction(snapshot, "改为手动下载"),
      progress,
    };
  }

  if (snapshot.status === "installing") {
    return {
      statusTitle: "正在安装更新...",
      statusDetail: latestVersion ? `目标版本：${latestVersion}` : "安装完成后应用会自动进入重启流程。",
      primaryAction: {
        label: "处理中...",
        action: "check",
        disabled: true,
        loading: true,
        emphasis: "primary",
      },
      secondaryAction: null,
      progress,
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
        emphasis: "primary",
      },
      secondaryAction: null,
      progress: null,
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
        emphasis: "primary",
      },
      secondaryAction: null,
      progress: null,
    };
  }

  if (snapshot.status === "error") {
    const releaseAction = buildOpenReleaseAction(snapshot, "手动下载");
    const downloadAction = buildOpenDownloadAction(snapshot, "下载安装包");
    const primaryAction = snapshot.error_stage === "download" && downloadAction
      ? downloadAction
      : snapshot.error_stage === "install"
        ? {
          label: "再次安装",
          action: "open_confirm" as const,
          disabled: isInstalling,
          loading: false,
          emphasis: "primary" as const,
        }
        : releaseAction ?? {
          label: "重新检查",
          action: "check",
          disabled: isChecking || isInstalling,
          loading: isChecking,
          emphasis: "primary",
        };
    const secondaryAction = primaryAction.action === "check"
      ? releaseAction ?? downloadAction
      : snapshot.error_stage === "install"
        ? downloadAction ?? releaseAction ?? {
          label: "重新检查",
          action: "check" as const,
          disabled: isChecking || isInstalling,
          loading: isChecking,
          emphasis: "secondary" as const,
        }
        : {
          label: "重新检查",
          action: "check" as const,
          disabled: isChecking || isInstalling,
          loading: isChecking,
          emphasis: "secondary" as const,
        };

    return {
      statusTitle: snapshot.error_stage === "check"
        ? "无法检查更新"
        : snapshot.error_stage === "download"
          ? "无法下载安装包"
          : snapshot.error_stage === "install"
            ? "更新安装失败"
            : "更新失败",
      statusDetail: buildErrorDetail(snapshot.error_stage, snapshot.error_message),
      primaryAction,
      secondaryAction,
      progress,
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
      emphasis: "primary",
    },
    secondaryAction: null,
    progress: null,
  };
}

export function buildUpdateConfirmDialogModel(snapshot: UpdateSnapshot): UpdateConfirmDialogModel {
  const currentVersion = formatVersion(snapshot.current_version);
  const latestVersion = formatVersion(snapshot.latest_version ?? snapshot.current_version);
  const isDownloaded = snapshot.status === "downloaded";
  const isDownloading = snapshot.status === "downloading";
  const isInstalling = snapshot.status === "installing";

  if (snapshot.status === "error") {
    const primaryAction = snapshot.error_stage === "download"
      ? buildOpenDownloadAction(snapshot, "下载安装包") ?? buildOpenReleaseAction(snapshot)
      : snapshot.error_stage === "install"
        ? {
          label: "再次安装",
          action: "open_confirm" as const,
          disabled: false,
          loading: false,
          emphasis: "primary" as const,
        }
        : buildOpenReleaseAction(snapshot, "手动下载");

    return {
      title: snapshot.error_stage === "check"
        ? "无法检查更新"
        : snapshot.error_stage === "download"
          ? "下载更新失败"
          : snapshot.error_stage === "install"
            ? "安装更新失败"
            : "更新失败",
      versionCompareLabel: `${currentVersion} -> ${latestVersion}`,
      confirmDescription: buildErrorDetail(snapshot.error_stage, snapshot.error_message)
        ?? "更新流程未能完成。",
      notesPreview: getReleaseNotesPreview(snapshot.release_notes),
      progress: buildUpdateProgressModel(snapshot),
      primaryAction,
      secondaryAction: primaryAction?.action === "check"
        ? buildOpenReleaseAction(snapshot, "手动下载")
        : snapshot.error_stage === "install"
          ? buildOpenDownloadAction(snapshot, "重新下载安装包")
            ?? buildOpenReleaseAction(snapshot, "手动下载")
          : {
            label: "重新检查",
            action: "check",
            disabled: false,
            loading: false,
            emphasis: "secondary",
          },
    };
  }

  return {
    title: isInstalling
      ? "正在安装更新"
      : isDownloading
        ? "正在下载更新"
        : isDownloaded
          ? "更新已下载"
          : "发现新版本",
    versionCompareLabel: `${currentVersion} -> ${latestVersion}`,
    confirmDescription: isInstalling
      ? "更新安装已经开始，请保持应用开启，安装完成后会进入重启流程。"
      : isDownloading
        ? "更新包正在下载中，下载完成后会自动切换到安装确认状态。"
        : isDownloaded
          ? "更新包已准备完成，确认后将重启并完成安装。"
          : "新版本已就绪，确认后将先下载更新包，下载完成后需要再次确认安装。",
    notesPreview: getReleaseNotesPreview(snapshot.release_notes),
    progress: buildUpdateProgressModel(snapshot),
    primaryAction: isInstalling
      ? null
      : {
        label: isDownloaded ? "重启安装" : "立即下载",
        action: "open_confirm",
        disabled: isDownloading,
        loading: isDownloading,
        emphasis: "primary",
      },
    secondaryAction: isDownloading
      ? buildOpenReleaseAction(snapshot, "改为手动下载")
      : null,
  };
}
