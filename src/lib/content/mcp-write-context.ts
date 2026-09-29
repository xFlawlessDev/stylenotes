/**
 * Shared plumbing for MCP write actions (docs/design/mcp-local-free.md #D2, §13b).
 *
 * Everything here is *contract plus lookup*: the context every action reads,
 * the coded outcome type, id resolution, and the cross-window change signal.
 * The actions themselves live in `mcp-write-actions.ts` (notes, tasks,
 * dependencies) and `mcp-workspace-actions.ts` (workspaces). Keeping this
 * separate means the two action modules do not have to import each other, and
 * `mcp-write-actions.ts` stays under the repo's file-size cap.
 */

import { browser } from '$app/environment';
import { emit } from '@tauri-apps/api/event';
import type { Note } from '$lib/content/content';
import type { McpErrorCode } from '$lib/content/mcp-types';
import type { Task } from '$lib/stores/tasks';
import { isTauri } from '$lib/windows';
import { workspaceStore } from '$lib/stores/workspaces.svelte';

/** Outcome of a write: either data for the shim, or a coded error. */
export type WriteOutcome =
	| { ok: true; data: unknown }
	| { ok: false; error: McpErrorCode; message: string };

/** Everything a write action may read and mutate. */
export type WriteContext = {
	notes: Note[];
	tasks: Task[];
	dependencies: TaskDependency[];
	workspaceIds: Set<string>;
	/** Full workspace records: workspace tools need ids, names and colours. */
	workspaces?: { id: string; name: string; color: string; createdAt: string }[];
};

type TaskDependency = { taskId: string; dependsOnTaskId: string };

export function fail(error: McpErrorCode, message: string): WriteOutcome {
	return { ok: false, error, message };
}

/**
 * Ids of the records in `workspaceId` that some window is still editing.
 *
 * A workspace delete cascades to its notes and tasks, but the debounced save
 * queue in a detail window runs in *another* window and lands after the
 * cascade: the delete is not the end of the story, the edit can be re-written
 * minutes later. The dialog uses this to warn before it throws that work away.
 */
export function unsavedInWorkspace(
	workspaceId: string,
	notes: Note[],
	tasks: Task[],
	pending: { note: Set<string>; task: Set<string> }
): { notes: string[]; tasks: string[] } {
	const inWorkspace = (record: { workspaceId?: string }) =>
		(record.workspaceId || 'workspace-default') === workspaceId;
	return {
		notes: notes.filter((note) => inWorkspace(note) && pending.note.has(note.id)).map((note) => note.title),
		tasks: tasks.filter((task) => inWorkspace(task) && pending.task.has(task.id)).map((task) => task.title),
	};
}

/** Whether `workspaceId` still exists. In-app only; never fetches. */
export function workspaceExists(context: WriteContext, workspaceId: string): boolean {
	if (workspaceId === 'workspace-default') return true;
	if (context.workspaceIds.has(workspaceId)) return true;
	if (browser && isTauri && workspaceStore.items.length) {
		return workspaceStore.items.some((workspace) => workspace.id === workspaceId);
	}
	return true;
}

/**
 * Refuses a write into a workspace that no longer exists.
 *
 * The context is loaded once per agent turn, so a `delete_workspace` that
 * raced the reads — or a call an older snapshot pointed at the deleted id —
 * would otherwise pass validation and recreate an orphaned row under the dead
 * id, which no switcher ever shows. `workspace-default` is always accepted:
 * it is the fallback every record without a workspace resolves to.
 */
export function workspaceGone(context: WriteContext, workspaceId: string | undefined): WriteOutcome | null {
	if (!workspaceId || workspaceId === 'workspace-default') return null;
	if (workspaceExists(context, workspaceId)) return null;
	return fail('not_found', `Workspace \`${workspaceId}\` no longer exists.`);
}

/** Resolves a workspace argument, rejecting an unknown id instead of guessing. */
export function resolveWorkspace(
	context: WriteContext,
	workspace: string | undefined
): { ok: true; id: string } | { ok: false; error: McpErrorCode; message: string } {
	if (!workspace) return { ok: true, id: 'workspace-default' };
	if (!context.workspaceIds.has(workspace)) {
		return { ok: false, error: 'unknown_workspace', message: `Unknown workspace \`${workspace}\`.` };
	}
	return { ok: true, id: workspace };
}

/** Emits a `*-changed` event so every open window reloads without a restart. */
export async function notify(channel: string): Promise<void> {
	if (!browser || !isTauri) return;
	await emit(channel).catch(() => undefined);
}

/**
 * Splits a `<workspaceId>/<entityId>` reference into its parts, or returns the
 * bare id. Every id in an MCP response is prefixed (§13b), so an agent will
 * usually echo one back and the write path must accept it just like reads do.
 */
export function parseEntityRef(raw: string): { workspaceId: string | null; id: string } {
	const slash = raw.indexOf('/');
	if (slash <= 0 || slash === raw.length - 1) return { workspaceId: null, id: raw };
	return { workspaceId: raw.slice(0, slash), id: raw.slice(slash + 1) };
}

type RecordLike = { id: string; workspaceId?: string };

/**
 * Resolves a record by bare id or prefixed ref. Returns an error when a bare id
 * matches more than one workspace, so an ambiguous call never edits the wrong
 * record (§13b).
 */
export function resolveRecord<T extends RecordLike>(
	records: T[],
	raw: string
): { found: T } | WriteOutcome {
	const { workspaceId, id } = parseEntityRef(raw);
	const matches = records.filter(
		(record) =>
			record.id === id &&
			(workspaceId === null || (record.workspaceId || 'workspace-default') === workspaceId)
	);
	if (matches.length === 0) return { ok: false, error: 'not_found', message: `No record with id \`${raw}\`.` };
	if (matches.length > 1) {
		return {
			ok: false,
			error: 'ambiguous_id',
			message: `\`${id}\` exists in more than one workspace; use a <workspaceId>/<id> prefix.`,
		};
	}
	return { found: matches[0] };
}

/** Resolves a task id for a tool call, surfacing `ambiguous_id`/`not_found`. */
export function taskOrError(context: WriteContext, raw: string): { found: Task } | WriteOutcome {
	return resolveRecord(context.tasks, raw);
}

/** Resolves a note id for a tool call, surfacing `ambiguous_id`/`not_found`. */
export function noteOrError(context: WriteContext, raw: string): { found: Note } | WriteOutcome {
	return resolveRecord(context.notes, raw);
}

/** Non-throwing note lookup, for validating a task's `noteIds`. */
export function findNote(context: WriteContext, id: string): Note | undefined {
	const resolved = resolveRecord(context.notes, id);
	return 'found' in resolved ? resolved.found : undefined;
}
