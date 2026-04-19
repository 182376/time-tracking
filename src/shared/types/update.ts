export type UpdateStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export type UpdateErrorStage =
  | "check"
  | "download"
  | "install";

export interface UpdateSnapshot {
  current_version: string;
  status: UpdateStatus;
  latest_version: string | null;
  release_notes: string | null;
  release_date: string | null;
  error_message: string | null;
  error_stage: UpdateErrorStage | null;
  downloaded_bytes: number | null;
  total_bytes: number | null;
  release_page_url: string | null;
  asset_download_url: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUpdateStatus(value: unknown): value is UpdateStatus {
  return typeof value === "string" && [
    "idle",
    "checking",
    "up_to_date",
    "available",
    "downloading",
    "downloaded",
    "installing",
    "error",
  ].includes(value);
}

function isUpdateErrorStage(value: unknown): value is UpdateErrorStage {
  return typeof value === "string" && [
    "check",
    "download",
    "install",
  ].includes(value);
}

export function isUpdateSnapshot(value: unknown): value is UpdateSnapshot {
  return isRecord(value)
    && typeof value.current_version === "string"
    && isUpdateStatus(value.status)
    && (typeof value.latest_version === "string" || value.latest_version === null)
    && (typeof value.release_notes === "string" || value.release_notes === null)
    && (typeof value.release_date === "string" || value.release_date === null)
    && (typeof value.error_message === "string" || value.error_message === null)
    && (isUpdateErrorStage(value.error_stage) || value.error_stage === null)
    && (typeof value.downloaded_bytes === "number" || value.downloaded_bytes === null)
    && (typeof value.total_bytes === "number" || value.total_bytes === null)
    && (typeof value.release_page_url === "string" || value.release_page_url === null)
    && (typeof value.asset_download_url === "string" || value.asset_download_url === null);
}

export function parseUpdateSnapshot(value: unknown): UpdateSnapshot | null {
  return isUpdateSnapshot(value) ? value : null;
}
