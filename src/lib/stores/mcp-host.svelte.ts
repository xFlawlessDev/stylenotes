/**
 * MCP host: the in-app side of the local bridge (docs/design/mcp-local-free.md).
 *
 * Runs in the always-alive `workspace` window. It keeps `snapshot.json` fresh,
 * publishes the grant in `app-info.json`, and executes the write jobs the shim
 * drops into `mcp/jobs/` — through the same validated actions the UI uses, so
 * cross-window refresh and cycle checks apply to every agent write.
 *
 * The job side is push-driven: instead of polling the directory, the host parks
 * one `mcp_wait_job` call that Rust answers the moment a job file lands
 * (`src-tauri/src/mcp_watch.rs`). An idle host therefore makes no calls at all.
 */

import { browser } from '$app/environment';
import { invoke, Channel } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { MCP_NOTE_BACKUPS, type McpGrant, type McpJob, type McpResult } from '$lib/content/mcp-types';
import { buildMcpSnapshot } from '$lib/content/mcp-snapshot';
import {
	completeTaskAction,
	createNoteAction,
	createTaskAction,
	deleteNoteAction,
	deleteTaskAction,
	editNoteBodyAction,
	journalTodayAction,
	linkTasksAction,
	unlinkTasksAction,
	updateNoteAction,
	updateNoteBodyAction,
	updateTaskAction,
	type WriteContext,
	type WriteOutcome,
} from '$lib/content/mcp-write-actions';
import {
	createWorkspaceAction,
	deleteWorkspaceAction,
	renameWorkspaceAction,
} from '$lib/content/mcp-workspace-actions';
import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { DEPENDENCIES_CHANGED } from '$lib/stores/dependencies.svelte';
import { NOTES_CHANGED } from '$lib/stores/notes';
import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
import { hydrateMcp, mcpStore, MCP_CHANGED, startMcpSync, clearSnapshot, refreshMcpClients, refreshMcpAudit } from '$lib/stores/mcp.svelte';
import { localToday } from '$lib/stores/settings.svelte';
import { workspaceStore, reloadWorkspaces, WORKSPACES_CHANGED } from '$lib/stores/workspaces.svelte';
import { isTauri } from '$lib/windows';
import { mcpRepo } from '$lib/db/mcp';
import { dependenciesRepo } from '$lib/db';
import { hasPendingEdit } from '$lib/stores/mcp-pending-edits';

/** Debounce for snapshot refresh after a local or remote change. */
const REFRESH_DEBOUNCE_MS = 300;
/** Floor between snapshot writes, so a burst of edits writes once. */
const REFRESH_FLOOR_MS = 2_000;
/**
 * Upper bound on one parked wait. Rust caps this further to stay clear of the
 * job deadline (see `mcp_watch::wait_budget`); this value only matters for the
 * case where the backend ignores the hint.
 */
const JOB_WAIT_MS = 1_000;
/** Backoff after a failed wait, so a broken bridge does not spin. */
const JOB_WAIT_ERROR_MS = 1_000;

let revision = 0;
let started = false;
let disposed = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let floorTimer: ReturnType<typeof setTimeout> | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let waiting = false;
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
			workspaces: workspaceStore.items.map((workspace) => ({ ...workspace })),
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
			today: localToday(),
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

/**
 * Parks one wait on the app side and runs whatever arrives.
 *
 * The answer comes over a `Channel`, not as the `invoke` reply: a reply that
 * takes a second would block Tauri's main thread — the loop that paints and
 * handles input — and freeze the app. Rust therefore answers an empty wait from
 * a worker thread, and this promise resolves as soon as the first message
 * lands.
 *
 * The wait is a hint, not a lease: the directory is re-read on every wake and
 * on every deadline, so a lost notification only delays execution, never
 * expires a job.
 */
async function waitForJob(): Promise<void> {
	if (disposed || waiting || !mcpStore.enabled) return;
	waiting = true;
	let settled = false;
	try {
		await new Promise<void>((resolve) => {
			const channel = new Channel<string | null>();
			channel.onmessage = (raw) => {
				if (settled) return;
				settled = true;
				void handleJob(raw).finally(resolve);
			};
			invoke('mcp_wait_job', { waitMs: JOB_WAIT_MS, channel }).catch(() => {
				if (settled) return;
				settled = true;
				resolve();
			});
		});
	} catch {
		await pause(JOB_WAIT_ERROR_MS);
	} finally {
		waiting = false;
	}
}

async function handleJob(raw: string | null): Promise<void> {
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
		case 'update_note': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localNoteEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That note has unsaved edits in this app.' };
			}
			return updateNoteAction(context, job.args);
		}
		case 'edit_note_body': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			if (localNoteEditPending(id)) {
				return { ok: false, error: 'busy_local_edit', message: 'That note has unsaved edits in this app.' };
			}
			const before = notes.find((note) => note.id === id);
			if (before) {
				// Same pre-change backup as update_note_body (§13a): a sweep is
				// smaller than a rewrite, not less destructive.
				await invoke('mcp_backup_note', { noteId: id, body: before.body, keep: MCP_NOTE_BACKUPS }).catch(() => undefined);
			}
			return editNoteBodyAction(context, job.args);
		}
		case 'delete_note': {
			const id = typeof job.args.id === 'string' ? job.args.id : '';
			const before = notes.find((note) => note.id === id);
			if (before) {
				await invoke('mcp_backup_note', { noteId: id, body: before.body, keep: MCP_NOTE_BACKUPS }).catch(() => undefined);
			}
			return deleteNoteAction(context, job.args);
		}
		case 'journal_today':
			return journalTodayAction(context, job.args);
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
		case 'create_workspace':
			return createWorkspaceAction(context, job.args);
		case 'rename_workspace':
			return renameWorkspaceAction(context, job.args);
		case 'delete_workspace':
			return deleteWorkspaceAction(context, job.args);
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
	const entity = (record.note ?? record.task ?? record.workspace) as
		| Record<string, unknown>
		| undefined;
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

/** Trailing sleep, used when a wait cannot be parked right away. */
function pause(ms: number): Promise<void> {
	return new Promise((resolve) => {
		waitTimer = setTimeout(() => {
			waitTimer = null;
			resolve();
		}, ms);
	});
}

/** Shortest pause between waits, so a disabled host cannot spin on the IPC. */
const JOB_WAIT_MIN_GAP_MS = 100;

/**
 * Keeps exactly one wait parked while MCP is on.
 *
 * Sequential on purpose: V1 keeps one job in flight, and a job must be answered
 * before the next wait starts, otherwise `jobs/` would report the same file
 * twice. The trailing gap keeps the 5 ms path — disable MCP while a wait is
 * parked — from re-arming in a tight loop.
 */
async function runJobLoop(): Promise<void> {
	while (!disposed && mcpStore.enabled) {
		await waitForJob();
		if (disposed || !mcpStore.enabled) return;
		await pause(JOB_WAIT_MIN_GAP_MS);
	}
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
		listen(WORKSPACES_CHANGED, () => void onWorkspacesChanged()),
		listen(MCP_CHANGED, () => void applyEnabledChange()),
	]);
	await applyEnabledChange();
}

/**
 * A workspace appeared, was renamed or was removed — possibly because of an MCP
 * write this host itself performed. The store must be re-read before the next
 * snapshot, or `workspaces` stays stale and count-less.
 */
async function onWorkspacesChanged(): Promise<void> {
	await reloadWorkspaces().catch(() => undefined);
	scheduleRefresh();
}

async function applyEnabledChange(): Promise<void> {
	await hydrateMcp();
	if (mcpStore.enabled) {
		void runJobLoop();
		await refreshMcpSnapshot('force');
		await Promise.all([refreshMcpClients(), refreshMcpAudit()]);
	} else {
		if (waitTimer) {
			clearTimeout(waitTimer);
			waitTimer = null;
		}
		await clearSnapshot();
	}
}

export function stopMcpHost(): void {
	disposed = true;
	if (refreshTimer) clearTimeout(refreshTimer);
	if (floorTimer) clearTimeout(floorTimer);
	if (waitTimer) clearTimeout(waitTimer);
	for (const unlisten of unlisteners) unlisten();
	unlisteners = [];
	started = false;
}
