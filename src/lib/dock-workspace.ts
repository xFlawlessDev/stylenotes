import type { DockHover } from '$lib/dock';

/**
 * Resolves the workspace a quick capture should land in.
 *
 * The dock mixes records from every workspace. A capture belongs to the
 * workspace the menu was opened from — which is the workspace of the item the
 * pointer was over, or the workspace this window is following when the menu was
 * opened from the `+` button without touching an item.
 */
export function captureWorkspaceId(menuWorkspace: string, fallback: string): string {
	return menuWorkspace || fallback;
}

/** Workspace of a hovered dock record, or an empty string when there is none. */
export function hoverWorkspaceId(hovered: DockHover | null): string {
	if (!hovered) return '';
	return recordWorkspaceId(hovered.kind === 'note' ? hovered.note : hovered.task);
}

/** Workspace of a note or task row, or an empty string when it has none. */
export function recordWorkspaceId(record: { workspaceId?: string }): string {
	return record.workspaceId ?? '';
}
