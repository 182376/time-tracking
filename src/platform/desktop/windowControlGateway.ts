import { getCurrentWindow } from "@tauri-apps/api/window";

export async function minimizeCurrentWindow(): Promise<void> {
  await getCurrentWindow().minimize();
}

export async function toggleCurrentWindowMaximized(): Promise<void> {
  await getCurrentWindow().toggleMaximize();
}

export async function closeCurrentWindow(): Promise<void> {
  await getCurrentWindow().close();
}

export async function startCurrentWindowDrag(): Promise<void> {
  await getCurrentWindow().startDragging();
}

export async function watchCurrentWindowMaximized(
  handler: (maximized: boolean) => void,
): Promise<() => void> {
  const currentWindow = getCurrentWindow();

  const syncMaximizedState = () => {
    void currentWindow.isMaximized()
      .then(handler)
      .catch((error) => {
        console.warn("read current window maximized state failed", error);
      });
  };

  syncMaximizedState();
  return currentWindow.onResized(syncMaximizedState);
}
