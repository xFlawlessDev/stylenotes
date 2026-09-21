import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const WORKSPACE_LABEL = "workspace";
export const OVERLAY_LABEL = "overlay";

export type WindowRole = "workspace" | "overlay";

export function currentWindowRole(): WindowRole {
  const label = getCurrentWindow().label;
  if (label === OVERLAY_LABEL) return "overlay";
  return "workspace";
}

async function focusOrCreate(label: string, options: Record<string, unknown>) {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.unminimize();
    await existing.setFocus();
    return existing;
  }
  return new WebviewWindow(label, options);
}

export async function openWorkspace() {
  return focusOrCreate(WORKSPACE_LABEL, {
    url: "/",
    title: "StyleNotes",
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    resizable: true,
    decorations: false,
    transparent: false,
    center: true,
  });
}

export async function openOverlay() {
  return focusOrCreate(OVERLAY_LABEL, {
    url: "/",
    title: "StyleNotes Dock",
    width: 64,
    height: 560,
    minWidth: 64,
    minHeight: 320,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    shadow: false,
  });
}

export async function toggleOverlay() {
  const overlay = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) {
    await openOverlay();
    return;
  }
  const visible = await overlay.isVisible();
  if (visible) {
    await overlay.hide();
  } else {
    await overlay.show();
    try {
      await overlay.setFocus();
    } catch {
      /* overlay is not focusable; showing is enough */
    }
  }
}

export async function revealCurrentWindow() {
  if (!isTauri) return;
  const win = getCurrentWindow();
  if (!(await win.isVisible())) {
    await win.show();
  }
}

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;