/**
 * Workspace write actions for MCP tool calls (docs/design/mcp-local-free.md #D2).
 *
 * A workspace is the scope itself, so these actions ignore the `workspace`
 * argument the other tools take. They write through `workspacesRepo` directly —
 * the same repo the workspace store uses — and emit `workspaces:changed` so the
 * dock and every switcher refresh without a restart.
 *
 * Deleting is destructive (it cascades to notes, tasks and folders), so it is
 * gated by `confirm: true` at the shim and refuses to remove the last workspace
 * here, matching `deleteWorkspace` in the store.
 */

import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import { workspacesRepo } from '$lib/db/workspaces';
import { WORKSPACES_CHANGED } from '$lib/stores/workspaces.svelte';
import { isTauri } from '$lib/windows';
import type { WriteContext, WriteOutcome } from '$lib/content/mcp-write-context';
import { fail, parseEntityRef } from '$lib/content/mcp-write-context';
import type { Workspace } from '$lib/workspace';

async function notify(): Promise<void> {
	if (!browser || !isTauri) return;
	await emit(WORKSPACES_CHANGED).catch(() => undefined);
}

/** Splits a `<workspaceId>/<id>` ref into its parts, or returns the bare id. */
function workspaceIdArg(raw: string): string {
	return parseEntityRef(raw).id;
}

function findWorkspace(context: WriteContext, raw: string): Workspace | undefined {
	const id = workspaceIdArg(raw);
	return context.workspaces?.find((workspace) => workspace.id === id);
}

export type CreateWorkspaceArgs = { name?: unknown; color?: unknown };

export async function createWorkspaceAction(
	context: WriteContext,
	args: CreateWorkspaceArgs
): Promise<WriteOutcome> {
	if (typeof args.name !== 'string' || !args.name.trim()) {
		return fail('bad_arguments', '`name` is required.');
	}
	const name = args.name.trim();
	const color = typeof args.color === 'string' && args.color ? args.color : 'primary';
	const workspace: Workspace = {
		id: crypto.randomUUID(),
		name,
		color,
		createdAt: new Date().toISOString(),
	};
	const duplicate = context.workspaces?.some(
		(existing) => existing.name.toLowerCase() === name.toLowerCase()
	);
	if (duplicate) {
		return fail('bad_arguments', `A workspace named \`${name}\` already exists.`);
	}
	if (!(await workspacesRepo.create(workspace))) {
		return fail('write_failed', 'The workspace could not be created.');
	}
	await notify();
	return {
		ok: true,
		data: { workspace: { id: workspace.id, name: workspace.name, color: workspace.color } },
	};
}

export type RenameWorkspaceArgs = { id?: unknown; name?: unknown };

export async function renameWorkspaceAction(
	context: WriteContext,
	args: RenameWorkspaceArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	if (typeof args.name !== 'string' || !args.name.trim()) {
		return fail('bad_arguments', '`name` is required.');
	}
	const workspace = findWorkspace(context, args.id);
	if (!workspace) {
		return fail('not_found', `No workspace with id \`${args.id}\`.`);
	}
	const name = args.name.trim();
	if (name === workspace.name) {
		return { ok: true, data: { workspace: { id: workspace.id, name, unchanged: true } } };
	}
	if (!(await workspacesRepo.rename(workspace.id, name))) {
		return fail('write_failed', 'The workspace could not be renamed.');
	}
	await notify();
	return { ok: true, data: { workspace: { id: workspace.id, name } } };
}

export type DeleteWorkspaceArgs = { id?: unknown; confirm?: unknown };

/** The workspace every record falls back to; deleting it strands those rows. */
const DEFAULT_WORKSPACE_ID = 'workspace-default';

export async function deleteWorkspaceAction(
	context: WriteContext,
	args: DeleteWorkspaceArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	if (args.confirm !== true) {
		return fail('bad_arguments', 'This tool permanently deletes data; pass `confirm: true` to proceed.');
	}
	const workspace = findWorkspace(context, args.id);
	if (!workspace) {
		return fail('not_found', `No workspace with id \`${args.id}\`.`);
	}
	// The default workspace is the fallback target for records without a
	// workspace (`workspaceOf`, `resolveWorkspace`), so removing it either
	// strands rows or silently re-adopts them elsewhere. Refuse outright.
	if (workspace.id === DEFAULT_WORKSPACE_ID) {
		return fail('last_workspace', 'The default workspace cannot be deleted.');
	}
	// Never remove the last remaining workspace: the app always needs one.
	if ((context.workspaces?.length ?? 0) <= 1) {
		return fail('last_workspace', 'The last workspace cannot be deleted.');
	}
	if (!(await workspacesRepo.remove(workspace.id))) {
		return fail('write_failed', 'The workspace could not be deleted.');
	}
	await notify();
	return { ok: true, data: { deleted: workspace.id, name: workspace.name } };
}

/** Exposed for the host's audit detail. */
export { workspaceIdArg };
