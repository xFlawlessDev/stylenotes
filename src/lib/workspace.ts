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
