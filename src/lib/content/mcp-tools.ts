/**
 * Tool registry for the local MCP server (docs/design/mcp-local-free.md #D9).
 *
 * This is the single source of truth: the Settings page lists these, the audit
 * log names them, and the Rust shim's `registry.rs` mirrors the same names. A
 * test asserts the two lists agree, so a mismatch is caught before release.
 */

import type { McpScope, McpToolDescriptor, McpToolKind } from '$lib/content/mcp-types';

export const MCP_TOOLS: McpToolDescriptor[] = [
	{ name: 'list_notes', kind: 'read', scope: 'notes', description: 'List notes with optional workspace, folder, tag and pin filters.' },
	{ name: 'search_notes', kind: 'read', scope: 'notes', description: 'Substring search over note titles, tags and bodies.' },
	{ name: 'get_note', kind: 'read', scope: 'notes', description: 'One note plus its wiki backlinks and outlinks.' },
	{ name: 'context', kind: 'read', scope: 'notes', description: 'Relevant notes for a query, with their neighbourhood in the graph.' },
	{ name: 'list_tasks', kind: 'read', scope: 'tasks', description: 'List tasks with status, priority, workspace, folder, due and overdue filters.' },
	{ name: 'get_task', kind: 'read', scope: 'tasks', description: 'One task with blockers, dependents and linked notes.' },
	{ name: 'task_board', kind: 'read', scope: 'tasks', description: 'Kanban columns in position order with per-status counts.' },
	{ name: 'daily_summary', kind: 'read', scope: 'tasks', description: 'Due and completed work, in-progress tasks and recently touched notes.' },
	{ name: 'list_dependencies', kind: 'read', scope: 'dependency', description: 'Every task-to-task dependency edge.' },
	{ name: 'critical_path', kind: 'read', scope: 'dependency', description: 'Longest dependency chain ending at a task.' },
	{ name: 'graph_query', kind: 'read', scope: 'notes', description: 'Graph nodes and edges around a node, by depth and edge kind.' },
	{ name: 'list_workspaces', kind: 'read', scope: 'workspace', description: 'Every workspace with its note and task counts.' },
	{ name: 'list_folders', kind: 'read', scope: 'workspace', description: 'Folder ids, labels and note counts, so a note can be filed.' },
	{ name: 'list_tags', kind: 'read', scope: 'notes', description: 'Every tag in use, with how many notes carry it.' },
	{ name: 'create_note', kind: 'write', scope: 'notes', description: 'Create a note from a title and body.' },
	{ name: 'update_note_body', kind: 'write', scope: 'notes', description: 'Replace a note body (a backup copy is kept first).' },
	{ name: 'edit_note_body', kind: 'write', scope: 'notes', description: 'Patch a note body in place: replace text or insert at start/end.' },
	{ name: 'update_note', kind: 'write', scope: 'notes', description: 'Patch note metadata: title, folder, tags and pinned.' },
	{ name: 'delete_note', kind: 'write', scope: 'notes', description: 'Delete a note; requires confirm: true.' },
	{ name: 'create_task', kind: 'write', scope: 'tasks', description: 'Create a task, optionally linked to notes.' },
	{ name: 'update_task', kind: 'write', scope: 'tasks', description: 'Patch fields on an existing task.' },
	{ name: 'complete_task', kind: 'write', scope: 'tasks', description: 'Mark a task done and completed.' },
	{ name: 'delete_task', kind: 'write', scope: 'tasks', description: 'Delete a task; requires confirm: true.' },
	{ name: 'link_tasks', kind: 'write', scope: 'dependency', description: 'Add a dependency; cycles and cross-workspace links are rejected.' },
	{ name: 'unlink_tasks', kind: 'write', scope: 'dependency', description: 'Remove a dependency.' },
	{ name: 'create_workspace', kind: 'write', scope: 'workspace', description: 'Create a workspace.' },
	{ name: 'rename_workspace', kind: 'write', scope: 'workspace', description: 'Rename an existing workspace.' },
	{ name: 'delete_workspace', kind: 'write', scope: 'workspace', description: 'Delete a workspace and its contents; requires confirm: true.' },
];

export const MCP_SCOPES: { id: McpScope; label: string; description: string }[] = [
	{ id: 'notes', label: 'Notes', description: 'Create, edit and delete note content' },
	{ id: 'tasks', label: 'Tasks', description: 'Create, update, complete and delete tasks' },
	{ id: 'dependency', label: 'Dependencies', description: 'Link and unlink task dependencies' },
	{ id: 'workspace', label: 'Workspaces', description: 'Create, rename and delete workspaces' },
];

export function toolsForScope(scope: McpScope): McpToolDescriptor[] {
	return MCP_TOOLS.filter((tool) => tool.scope === scope);
}

export function toolsByKind(kind: McpToolKind): McpToolDescriptor[] {
	return MCP_TOOLS.filter((tool) => tool.kind === kind);
}

export function findTool(name: string): McpToolDescriptor | undefined {
	return MCP_TOOLS.find((tool) => tool.name === name);
}

/**
 * Whether a call is allowed by the current grant. Mirrors the shim's gate so
 * the UI can explain a refusal before it happens.
 */
export function toolAllowed(
	tool: McpToolDescriptor,
	grant: { access: 'read' | 'write'; scopes: McpScope[] }
): boolean {
	if (tool.kind === 'read') return true;
	return grant.access === 'write' && grant.scopes.includes(tool.scope);
}

/** Parses the tool names out of the Rust registry source, for the drift test. */
export function parseRustRegistry(source: string): string[] {
	const names: string[] = [];
	const pattern = /ToolDescriptor\s*\{\s*name:\s*"([a-z_]+)"/g;
	let match = pattern.exec(source);
	while (match) {
		names.push(match[1]);
		match = pattern.exec(source);
	}
	return names;
}
