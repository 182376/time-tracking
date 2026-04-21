import { invoke } from "@tauri-apps/api/core";

export type WidgetSide = "left" | "right";

export interface WidgetPlacement {
  side: WidgetSide;
  anchor_y: number;
}

function isWidgetSide(value: unknown): value is WidgetSide {
  return value === "left" || value === "right";
}

export function parseWidgetPlacement(value: unknown): WidgetPlacement | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!isWidgetSide(record.side) || typeof record.anchor_y !== "number") {
    return null;
  }

  return {
    side: record.side,
    anchor_y: record.anchor_y,
  };
}

export async function getWidgetPlacement(): Promise<WidgetPlacement | null> {
  const payload = await invoke<unknown>("cmd_get_widget_placement");
  return parseWidgetPlacement(payload);
}

export async function setWidgetPlacement(side: WidgetSide, anchorY: number): Promise<void> {
  await invoke("cmd_set_widget_placement", {
    side,
    anchorY,
  });
}

export async function applyWidgetLayout(
  side: WidgetSide,
  anchorY: number,
  expanded: boolean,
  showObjectSlot: boolean,
): Promise<void> {
  await invoke("cmd_apply_widget_layout", {
    side,
    anchorY,
    expanded,
    showObjectSlot,
  });
}

export async function setWidgetExpanded(
  expanded: boolean,
  showObjectSlot: boolean,
): Promise<void> {
  await invoke("cmd_set_widget_expanded", {
    expanded,
    showObjectSlot,
  });
}

export async function showMainWindow(): Promise<void> {
  await invoke("cmd_show_main_window");
}

export async function hideWidgetWindow(): Promise<void> {
  await invoke("cmd_hide_widget_window");
}
