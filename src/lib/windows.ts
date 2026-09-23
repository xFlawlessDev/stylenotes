import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const WORKSPACE_LABEL = "workspace";
export const OVERLAY_LABEL = "overlay";
export const KANBAN_LABEL = "kanban";

/** Event that asks the workspace window to switch section/view. */
export const NAVIGATE_EVENT = "stylenotes:navigate";
export const NOTE_HEADING_EVENT = "stylenotes:note-heading";

export type WorkspaceView = "dashboard" | "list" | "kanban" | "gantt";

export type WorkspaceSection = "notes" | "tasks" | "graph";

export type WorkspaceNavigate = {
  section: WorkspaceSection;
  view?: WorkspaceView;
  /** Record the workspace should select once the section is showing (task id). */
  recordId?: string;
};
export const NOTE_WINDOW_PREFIX = "note-";
export const TASK_WINDOW_PREFIX = "task-";

export type WindowRole = "workspace" | "overlay" | "kanban" | "note" | "task";

export function currentWindowRole(): WindowRole {
  const label = getCurrentWindow().label;
  if (label === OVERLAY_LABEL) return "overlay";
  if (label === KANBAN_LABEL) return "kanban";
  if (label.startsWith(NOTE_WINDOW_PREFIX)) return "note";
  if (label.startsWith(TASK_WINDOW_PREFIX)) return "task";
  return "workspace";
}

/** Reads the record id encoded in a per-record window label. */
export function currentRecordId(prefix: string): string | null {
  const label = getCurrentWindow().label;
  return label.startsWith(prefix) ? label.slice(prefix.length) : null;
}

export function currentNoteId(): string | null {
  return currentRecordId(NOTE_WINDOW_PREFIX);
}

export function currentTaskId(): string | null {
  return currentRecordId(TASK_WINDOW_PREFIX);
}

async function focusOrCreate(label: string, options: Record<string, unknown>) {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.unminimize();
    try {
      await existing.setFocus();
    } catch {
      /* not every window is focusable (e.g. the dock overlay) */
    }
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
    width: 360,
    height: 304,
    minWidth: 16,
    minHeight: 16,
    maxWidth: 360,
    maxHeight: 304,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    shadow: false,
    focus: false,
    focusable: false,
  });
}

/** Options must stay in sync with the kanban window in `tauri.conf.json`. */
export async function openKanban() {
  return focusOrCreate(KANBAN_LABEL, {
    url: "/",
    title: "StyleNotes Kanban",
    width: 720,
    height: 440,
    minWidth: 380,
    minHeight: 280,
    resizable: true,
    decorations: false,
    transparent: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
  });
}

/** Opens the workspace on the Dashboard view of the tasks section. */
export async function openTasksInWorkspace() {
  if (isTauri) {
    const payload: WorkspaceNavigate = { section: "tasks", view: "dashboard" };
    await emit(NAVIGATE_EVENT, payload).catch(() => undefined);
  }
  return openWorkspace();
}

/** Opens the workspace on the List view of the tasks section with `taskId` selected. */
export async function openTaskInWorkspace(taskId: string) {
  if (isTauri) {
    const payload: WorkspaceNavigate = { section: "tasks", view: "list", recordId: taskId };
    await emit(NAVIGATE_EVENT, payload).catch(() => undefined);
  }
  return openWorkspace();
}

/** One always-on-top editor window per note, label `note-<id>`. */
export async function openNoteWindow(noteId: string) {
  return focusOrCreate(`${NOTE_WINDOW_PREFIX}${noteId}`, {
    url: "/",
    title: "StyleNotes Note",
    width: 440,
    height: 540,
    minWidth: 320,
    minHeight: 240,
    resizable: true,
    decorations: false,
    transparent: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: false,
  });
}

/** One always-on-top detail window per task, label `task-<id>`. */
export async function openTaskWindow(taskId: string) {
  return focusOrCreate(`${TASK_WINDOW_PREFIX}${taskId}`, {
    url: "/",
    title: "StyleNotes Task",
    width: 420,
    height: 520,
    minWidth: 300,
    minHeight: 260,
    resizable: true,
    decorations: false,
    transparent: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: false,
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

/**
 * Same as `revealCurrentWindow`, plus focus: detail windows opened from the
 * dock or a global shortcut should be ready to type in.
 */
export async function revealAndFocusCurrentWindow() {
  if (!isTauri) return;
  const win = getCurrentWindow();
  if (!(await win.isVisible())) {
    await win.show();
  }
  try {
    await win.setFocus();
  } catch {
    /* the window may not be focusable */
  }
}

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
