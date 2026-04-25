import { invoke } from "@tauri-apps/api/core";
import { executeWriteBatch, type SqlWriteOperation } from "./sqlite.ts";

const COMMIT_CLASSIFICATION_SETTINGS_COMMAND = "cmd_commit_classification_settings";

export interface ClassificationSettingMutation {
  key: string;
  value: string | null;
}

function stringifyInvokeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isCommitClassificationSettingsCommandUnavailable(error: unknown): boolean {
  const message = stringifyInvokeError(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes(COMMIT_CLASSIFICATION_SETTINGS_COMMAND)
    && (
      normalized.includes("not found")
      || normalized.includes("unknown")
      || normalized.includes("unhandled")
      || normalized.includes("not registered")
    )
  ) || (
    normalized.includes("command")
    && normalized.includes("not found")
  );
}

export function buildClassificationSettingMutationOperations(
  mutations: readonly ClassificationSettingMutation[],
): SqlWriteOperation[] {
  return mutations.map((mutation) => {
    if (mutation.value === null) {
      return {
        query: "DELETE FROM settings WHERE key = ?",
        values: [mutation.key],
      };
    }

    return {
      query: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      values: [mutation.key, mutation.value],
    };
  });
}

export async function commitClassificationSettingMutations(
  mutations: readonly ClassificationSettingMutation[],
): Promise<void> {
  if (mutations.length === 0) {
    return;
  }

  try {
    await invoke(COMMIT_CLASSIFICATION_SETTINGS_COMMAND, { mutations });
  } catch (error) {
    if (!isCommitClassificationSettingsCommandUnavailable(error)) {
      throw error;
    }

    await executeWriteBatch(buildClassificationSettingMutationOperations(mutations));
  }
}
