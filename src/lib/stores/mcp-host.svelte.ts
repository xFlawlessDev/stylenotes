/**
 * MCP host: the in-app side of the local bridge (docs/design/mcp-local-free.md).
 *
 * Runs in the always-alive `workspace` window. It keeps `snapshot.json` fresh,
 * publishes the grant in `app-info.json`, and executes the write jobs the shim
 * drops into `mcp/jobs/` — through the same validated actions the UI uses, so
 * cross-window refresh and cycle checks apply to every agent write.
 */

import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { MCP_NOTE_BACKUPS, type McpGrant, type McpJob, type McpResult } from '$lib/content/mcp-types';
import { buildMcpSnapshot } from '$lib/content/mcp-snapshot';
import {
	completeTaskAction,
	createNoteAction,
	createTaskAction,
	deleteNoteAction,
	deleteTaskAction,
	linkTasksAction,
	unlinkTasksAction,
	updateNoteBodyAction,
	updateTaskAction,
	type WriteContext,
	type WriteOutcome,
} from '$lib/content/mcp-write-actions';
import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { DEPENDENCIES_CHANGED } from '$lib/stores/dependencies.svelte';
import { NOTES_CHANGED } from '$lib/stores/notes';
import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
import { hydrateMcp, mcpStore, MCP_CHANGED, startMcpSync, clearSnapshot, refreshMcpClients, refreshMcpAudit } from '$lib/stores/mcp.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { isTauri } from '$lib/windows';
import { mcpRepo } from '$lib/db/mcp';
import { dependenciesRepo } from '$lib/db';
import { hasPendingEdit } from '$lib/stores/mcp-pending-edits';

/** Debounce for snapshot refresh after a local or remote change. */
const REFRESH_DEBOUNCE_MS = 300;
/** Floor between snapshot writes, so a burst of edits writes once. */
const REFRESH_FLOOR_MS = 2_000;
/** Poll cadence for write jobs; the shim waits at most 5 s (see bridge.rs). */
const JOB_POLL_MS = 150;

let revision = 0;
let started = false;
let disposed = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let floorTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;
let unlisteners: UnlistenFn[] = [];

/** Loads every record across workspaces, for validation of cross-workspace calls. */
async function loadContext(): Promise<{ context: WriteContext; notes: Awaited<ReturnType<typeof listAllNotes>>; tasks: Awaited<ReturnType<typeof listAllTasks>> }> {
	const [notes, tasks] = await Promise.all([listAllNotes(), listAllTasks()]);
	const dependencies = workspaceStore.items.length
		? (await Promise.all(workspaceStore.items.map((workspace) => dependenciesRepo.list(workspace.id).catch(() => [])))).flat()
		: [];
	return {
		notes,
		tasks,
		context: {
			notes,
			tasks,
			dependencies,
			workspaceIds: new Set(workspaceStore.items.map((workspace) => workspace.id)),
		},
	};
}

/** Writes the snapshot and keeps `app-info.json` in step. */
export async function refreshMcpSnapshot(reason = 'change'): Promise<void> {
	if (!browser || !isTauri || !mcpStore.enabled) return;
	const now = Date.now();
	if (now - lastWriteAt < REFRESH_FLOOR_MS && reason !== 'force') {
		if (!floorTimer) {
			floorTimer = setTimeout(() => {
				floorTimer = null;
				void refreshMcpSnapshot('floor');
			}, REFRESH_FLOOR_MS - (now - lastWriteAt));
		}
		return;
	}
	lastWriteAt = now;
	try {
		const { context, notes, tasks } = await loadContext();
		revision += 1;
		const generatedAt = new Date().toISOString();
		const snapshot = buildMcpSnapshot({
			notes,
			tasks,
			dependencies: context.dependencies,
			folders: await loadFolders(context),
			workspaces: workspaceStore.items,
			revision,
			appRunning: true,
			generatedAt,
		});
		await invoke('mcp_write_snapshot', { payload: JSON.stringify(snapshot) });
		await invoke('mcp_write_app_info', {
			enabled: true,
			snapshotRev: revision,
			generatedAt,
			grant: currentGrant(),
		});
	} catch {
		/* the app keeps running; the next change retries */
	}
}

async function loadFolders(context: WriteContext) {
	// The snapshot's folder list is cosmetic; derive it from notes to avoid an
	// extra workspace-scoped read.
	const seen = new Map<string, { id: string; label: string; workspaceId: string }>();
	for (const note of context.notes) {
		if (!seen.has(note.folder)) {
			seen.set(note.folder, {
				id: note.folder,
				label: note.folder,
				workspaceId: note.workspaceId || 'workspace-default',
			});
		}
	}
	return [...seen.values()];
}

function currentGrant(): McpGrant {
	return { access: mcpStore.settings.access, scopes: [...mcpStore.settings.scopes] };
}

/** Schedules a refresh, coalescing bursts of change events. */
function scheduleRefresh(): void {
	if (refreshTimer) clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		refreshTimer = null;
		void refreshMcpSnapshot();
	}, REFRESH_DEBOUNCE_MS);
}

// --- job execution ----------------------------------------------------------

async function pollOnce(): Promise<void> {
	if (disposed || !mcpStore.enabled) return;
	let raw: string | null = null;
	try {
		raw = await invoke<string | null>('mcp_poll_job');
	} catch {
		return;
	}
	if (!raw) return;
	let job: McpJob;
	try {
		job = JSON.parse(raw) as McpJob;
	} catch {
		return;
	}
	if (Date.now() > job.deadline) {
		// The shim already gave up; drop the stale job so it does not block.
		await writeResult(job.id, { id: job.id, ok: false, error: 'timeout', message: 'Job expired.' });
		return;
	}
	await executeJob(job);
}

async function executeJob(job: McpJob): Promise<void> {
	const outcome = await runAction(job);
	const scope = scopeOf(job.tool);
	if (mcpStore.settings.audit) {
		await mcpRepo
			.addAudit({
				instanceId: job.instance,
				tool: job.tool,
				scope,
				ok: outcome.ok,
				workspace: job.workspace,
				detail: outcome.ok ? summarize(outcome.data) : outcome.message,
			})
			.catch(() => undefined);
	}
	await mcpRepo.touchClient({ instanceId: job.instance, name: clientName(job.instance), source: sourceOf(job.instance) }).catch(() => undefined);
	await writeResult(job.id, outcome.ok
		? { id: job.id, ok: true, data: outcome.data, revision }
		: { id: job.id, ok: false, error: outcome.error, message: outcome.message });
	void refreshMcpSnapshot('write');
}

/** True when the user has a pending local edit for the entity a write touches. */
function localNoteEditPending(noteId: string): boolean {
	return hasPendingEdit('note', noteId);
}

/** True when a task detail window has unsaved changes for that task. */
function localTaskEditPending(taskId: string): boolean {
	return hasPendingEdit('task', taskId);
}

async function runAction(job: McpJob): Promise<WriteOutcome> {
	const { context, notes } = await loadContext();
	switch (job.tool) {
		case 'create_note':
			return createNoteAction(context, job.args);
		case 'update_note_body': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localNoteEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That note has unsaved edits in this app.' };
			}
			const before = notes.find((note) => note.id === id);
			if (before) {
				// Keep a copy before the body changes, so a bad agent edit is recoverable (#13a).
				await invoke('mcp_backup_note', { noteId: id, body: before.body, keep: MCP_NOTE_BACKUPS }).catch(() => undefined);
			}
			return updateNoteBodyAction(context, job.args);
		}
		case 'delete_note': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			const before = notes.find((note) => note.id === id);
			if (before) {
				await invoke('mcp_backup_note', { noteId: id, body: before.body, keep: MCP_NOTE_BACKUPS }).catch(() => undefined);
			}
			return deleteNoteAction(context, job.args);
		}
		case 'create_task':
			return createTaskAction(context, job.args);
		case 'update_task': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localTaskEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That task has unsaved edits in this app.' };
			}
			return updateTaskAction(context, job.args);
		}
		case 'complete_task': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localTaskEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That task has unsaved edits in this app.' };
			}
			return completeTaskAction(context, job.args);
		}
		case 'delete_task': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localTaskEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That task has unsaved edits in this app.' };
			}
			return deleteTaskAction(context, job.args);
		}
		case 'link_tasks':
			return linkTasksAction(context, job.args);
		case 'unlink_tasks':
			return unlinkTasksAction(context, job.args);
		default:
			return { ok: false, error: 'unknown_tool', message: `Unsupported write tool \`${job.tool}\`.` };
	}
}

function scopeOf(tool: string): 'read' | 'write' {
	return tool.startsWith('list_') || tool.startsWith('get_') ? 'read' : 'write';
}

function summarize(data: unknown): string {
	if (!data || typeof data !== 'object') return '';
	const record = data as Record<string, unknown>;
	const entity = (record.note ?? record.task) as Record<string, unknown> | undefined;
	if (entity?.id) return String(entity.id);
	if (record.deleted) return `deleted ${record.deleted}`;
	return '';
}

/** Best-effort labels from the `--instance` id the shim was launched with. */
function sourceOf(instance: string): string {
	if (instance.startsWith('claude')) return 'claude';
	if (instance.startsWith('cursor')) return 'cursor';
	if (instance.startsWith('codex')) return 'codex';
	if (instance.startsWith('zed')) return 'zed';
	return 'unknown';
}

function clientName(instance: string): string {
	const source = sourceOf(instance);
	const labels: Record<string, string> = {
		claude: 'Claude Desktop',
		cursor: 'Cursor',
		codex: 'Codex',
		zed: 'Zed',
		unknown: 'MCP client',
	};
	return labels[source] ?? 'MCP client';
}

async function writeResult(id: string, payload: McpResult): Promise<void> {
	await invoke('mcp_write_result', { id, payload: JSON.stringify(payload) }).catch(() => undefined);
}

function tick(): void {
	pollTimer = setTimeout(() => {
		void pollOnce().finally(() => {
			if (!disposed) tick();
		});
	}, JOB_POLL_MS);
}

// --- lifecycle --------------------------------------------------------------

/** Starts the host: snapshot, grant publishing, and the job loop. Idempotent. */
export async function startMcpHost(): Promise<void> {
	if (started || !browser || !isTauri) return;
	started = true;
	await hydrateMcp();
	await startMcpSync();
	unlisteners = await Promise.all([
		listen(NOTES_CHANGED, () => scheduleRefresh()),
		listen(TASKS_CHANGED, () => scheduleRefresh()),
		listen(DEPENDENCIES_CHANGED, () => scheduleRefresh()),
		listen(MCP_CHANGED, () => void applyEnabledChange()),
	]);
	await applyEnabledChange();
}

async function applyEnabledChange(): Promise<void> {
	await hydrateMcp();
	if (mcpStore.enabled) {
		if (!pollTimer) tick();
		await refreshMcpSnapshot('force');
		await Promise.all([refreshMcpClients(), refreshMcpAudit()]);
	} else {
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
		await clearSnapshot();
	}
}

export function stopMcpHost(): void {
	disposed = true;
	if (refreshTimer) clearTimeout(refreshTimer);
	if (floorTimer) clearTimeout(floorTimer);
	if (pollTimer) clearTimeout(pollTimer);
	for (const unlisten of unlisteners) unlisten();
	unlisteners = [];
	started = false;
}
