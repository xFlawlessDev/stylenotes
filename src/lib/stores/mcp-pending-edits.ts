/**
 * Tracks which notes and tasks have unsaved local edits, so an agent write can
 * be refused instead of overwriting the user's keystrokes (#D4).
 *
 * The note/task detail windows register themselves here while their save queue
 * is dirty; the MCP host checks it before a write. It is deliberately tiny and
 * framework-free so both sides can import it without a cycle.
 */

import { browser } from '$app/environment';

type PendingKind = 'note' | 'task';

const pending: Record<PendingKind, Set<string>> = { note: new Set(), task: new Set() };

/** Marks a record as having unsaved edits (`dirty`) or settled. */
export function setPendingEdit(kind: PendingKind, id: string, dirty: boolean): void {
	if (!browser || !id) return;
	if (dirty) pending[kind].add(id);
	else pending[kind].delete(id);
}

/** Whether the record currently has unsaved edits in some window. */
export function hasPendingEdit(kind: PendingKind, id: string): boolean {
	return pending[kind].has(id);
}

/**
 * Raw pending sets, for a caller that must intersect them with a workspace's
 * records before deleting it (`unsavedInWorkspace` in `mcp-write-actions`).
 * Returns copies: the sets are mutated by the detail windows.
 */
export function pendingEdits(): { note: Set<string>; task: Set<string> } {
	return { note: new Set(pending.note), task: new Set(pending.task) };
}

/** Test seam: forgets every tracked edit. */
export function clearPendingEdits(): void {
	pending.note.clear();
	pending.task.clear();
}
