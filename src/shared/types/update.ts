export type UpdateStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateSnapshot {
  current_version: string;
  status: UpdateStatus;
  latest_version: string | null;
  release_notes: string | null;
  release_date: string | null;
  error_message: string | null;
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

export function isUpdateSnapshot(value: unknown): value is UpdateSnapshot {
  return isRecord(value)
    && typeof value.current_version === "string"
    && isUpdateStatus(value.status)
    && (typeof value.latest_version === "string" || value.latest_version === null)
    && (typeof value.release_notes === "string" || value.release_notes === null)
    && (typeof value.release_date === "string" || value.release_date === null)
    && (typeof value.error_message === "string" || value.error_message === null);
}

export function parseUpdateSnapshot(value: unknown): UpdateSnapshot | null {
  return isUpdateSnapshot(value) ? value : null;
}
