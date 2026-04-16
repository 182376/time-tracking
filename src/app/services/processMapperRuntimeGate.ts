import { refreshProcessMapperRuntime } from "./processMapperRuntimeService.ts";

let processMapperRefreshPromise: Promise<void> | null = null;

export async function ensureProcessMapperRuntimeReady(): Promise<void> {
  if (!processMapperRefreshPromise) {
    processMapperRefreshPromise = refreshProcessMapperRuntime().finally(() => {
      processMapperRefreshPromise = null;
    });
  }

  await processMapperRefreshPromise;
}
