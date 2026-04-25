import { invoke } from "@tauri-apps/api/core";

export type WidgetSide = "left" | "right";

interface RawWidgetPlacement {
  side: WidgetSide;
  anchor_y: number;
}

export interface WidgetPlacement {
  side: WidgetSide;
  anchorY: number;
}

function isWidgetSide(value: unknown): value is WidgetSide {
  return value === "left" || value === "right";
}

function isRawWidgetPlacement(value: unknown): value is RawWidgetPlacement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return isWidgetSide(record.side) && typeof record.anchor_y === "number";
}

function mapRawWidgetPlacement(raw: RawWidgetPlacement): WidgetPlacement {
  return {
    side: raw.side,
    anchorY: raw.anchor_y,
  };
}

export function parseWidgetPlacement(value: unknown): WidgetPlacement | null {
  return isRawWidgetPlacement(value) ? mapRawWidgetPlacement(value) : null;
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
