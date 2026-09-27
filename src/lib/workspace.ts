export const DEFAULT_WORKSPACE_ID = 'workspace-default';

export type Workspace = {
	id: string;
	name: string;
	color: string;
	createdAt: string;
};

/** Material color roles a workspace may use for its folder icon. */
type WorkspaceColor = { text: string; chip: string };

const WORKSPACE_COLORS: Record<string, WorkspaceColor> = {
	primary: { text: 'text-primary', chip: 'bg-primary/15 text-primary' },
	secondary: { text: 'text-secondary', chip: 'bg-secondary/15 text-secondary' },
	tertiary: { text: 'text-tertiary', chip: 'bg-tertiary/15 text-tertiary' },
	error: { text: 'text-error', chip: 'bg-error/15 text-error' },
};

/** Tailwind classes coloring a workspace's folder icon; unknown colors fall back to primary. */
export function workspaceColorClass(color: string): string {
	return (WORKSPACE_COLORS[color] ?? WORKSPACE_COLORS.primary).text;
}

/** Tailwind classes for a rounded chip that holds the folder icon. */
export function workspaceChipClass(color: string): string {
	return (WORKSPACE_COLORS[color] ?? WORKSPACE_COLORS.primary).chip;
}

/** Stable placeholder used when a record points at a workspace that is gone. */
export function fallbackWorkspace(id = DEFAULT_WORKSPACE_ID): Workspace {
	return { id, name: 'Personal', color: 'primary', createdAt: new Date(0).toISOString() };
}

/**
 * Resolves a record's workspace for display. Records without a workspace (the
 * pre-workspace rows) and unknown ids both fall back, so a badge always has a
 * name and a colour to render.
 */
export function workspaceOf(items: Workspace[], workspaceId: string | undefined): Workspace {
	const id = workspaceId || DEFAULT_WORKSPACE_ID;
	return items.find((item) => item.id === id) ?? fallbackWorkspace(id);
}

/** Binds {@link workspaceOf} to a workspace list, for components. */
export function workspaceLookupIn(items: Workspace[]): (workspaceId: string | undefined) => Workspace {
	return (workspaceId) => workspaceOf(items, workspaceId);
}

/**
 * The distinct workspaces a set of docked records belongs to, in first-seen
 * order. Used to colour the dock only when it actually mixes workspaces.
 */
export function overlayWorkspaceIds(
	tasks: { workspaceId?: string }[],
	notes: { workspaceId?: string }[]
): string[] {
	const ids: string[] = [];
	for (const item of [...tasks, ...notes]) {
		const id = item.workspaceId || DEFAULT_WORKSPACE_ID;
		if (!ids.includes(id)) ids.push(id);
	}
	return ids;
}
