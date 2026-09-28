/**
 * Shared contract for the local MCP bridge (docs/design/mcp-local-free.md).
 *
 * Everything here is pure data: protocol version, snapshot shapes, tool
 * descriptors, and the job/result envelopes exchanged through the file bridge
 * in the app data directory. Keeping it in one module means the Rust shim and
 * the TS host cannot drift on field names.
 */

/** Bumped whenever the bridge or snapshot shape changes incompatibly. */
export const MCP_PROTOCOL = 1;

/** Error codes the shim and the host agree on. */
export type McpErrorCode =
	| 'mcp_disabled'
	| 'protocol_mismatch'
	| 'app_not_running'
	| 'snapshot_unavailable'
	| 'snapshot_truncated'
	| 'write_not_granted'
	| 'unknown_tool'
	| 'bad_arguments'
	| 'unknown_workspace'
	| 'ambiguous_id'
	| 'not_found'
	| 'busy_local_edit'
	| 'dependency_cycle'
	| 'write_failed'
	| 'timeout';

export type McpScope = 'notes' | 'tasks' | 'dependency';

export type McpAccess = 'read' | 'write';

export type McpToolKind = 'read' | 'write';

/** One entry of the tool registry (#D9): the single source for handshake + UI. */
export type McpToolDescriptor = {
	name: string;
	kind: McpToolKind;
	scope: McpScope;
	description: string;
};

/** Row of `mcp_settings` (#D7). */
export type McpSettings = {
	access: McpAccess;
	scopes: McpScope[];
	/** Empty array = all workspaces. */
	workspaces: string[];
	audit: boolean;
	logLimit: number;
	updatedAt: string;
};

/** Row of `mcp_clients` (#D7). */
export type McpClientRecord = {
	instanceId: string;
	name: string;
	source: string;
	createdAt: string;
	lastSeen: string;
};

/** Row of `mcp_audit` (#D7). */
export type McpAuditRecord = {
	id: number;
	at: string;
	instanceId: string | null;
	tool: string;
	scope: McpToolKind;
	ok: boolean;
	workspace: string;
	detail: string;
};

/** Grant attached to every job: what the user allowed at the time of the call. */
export type McpGrant = {
	access: McpAccess;
	scopes: McpScope[];
};

/** Job file written by the shim, executed by the host inside the app (#D2). */
export type McpJob = {
	id: string;
	tool: string;
	args: Record<string, unknown>;
	grant: McpGrant;
	instance: string;
	workspace: string;
	/** Epoch milliseconds; past it the shim stops waiting and the job is dead. */
	deadline: number;
};

/** Result file written by the host, read by the shim. */
export type McpResult = {
	id: string;
	ok: boolean;
	/** Present when `ok` is false. */
	error?: McpErrorCode;
	message?: string;
	/** Tool-specific payload when `ok` is true. */
	data?: unknown;
	/** Snapshot revision produced after the write, so the shim can refresh. */
	revision?: number;
};

/** Snapshot revision + freshness metadata written alongside the data (#D3). */
export type McpSnapshotMeta = {
	protocol: number;
	revision: number;
	generatedAt: string;
	truncated: boolean;
	appRunning: boolean;
	/** Why the snapshot fell back to index-only mode, when it did. */
	truncatedReason?: string;
};

/** Per-note entry in the snapshot. Body is omitted in index-only mode. */
export type McpSnapshotNote = {
	id: string;
	workspaceId: string;
	title: string;
	folder: string;
	tags: string[];
	pinned: boolean;
	overlay: boolean;
	excerpt: string;
	body?: string;
	/** Epoch milliseconds; never the display `updated` column (#D13). */
	createdAt: number;
	updatedAt: number;
};

export type McpSnapshotTask = {
	id: string;
	workspaceId: string;
	title: string;
	notes: string;
	status: string;
	priority: string;
	folder: string;
	noteIds: string[];
	startAt: string | null;
	dueAt: string | null;
	position: number;
	completed: boolean;
	overlay: boolean;
	blocked: boolean;
	blockedBy: string[];
	blocking: string[];
};

export type McpSnapshotDependency = { taskId: string; dependsOnTaskId: string };

export type McpSnapshotWorkspace = { id: string; name: string };

export type McpSnapshotFolder = { id: string; label: string; workspaceId: string };

/**
 * Graph precomputed by the app with `buildWorkspaceGraph` (#D3 invariant 2).
 * The shim only filters these node/edge lists by neighbours, depth and kind —
 * it never reimplements wiki link resolution.
 */
export type McpSnapshotGraphNode = {
	/** Prefixed `note:<id>` / `task:<id>` from `buildWorkspaceGraph`. */
	id: string;
	entityId: string;
	kind: 'note' | 'task';
	workspaceId: string;
	title: string;
	folder: string;
	orphan: boolean;
	degree: number;
	status?: string;
};

export type McpSnapshotGraphEdge = {
	id: string;
	source: string;
	target: string;
	kind: 'wiki' | 'dependency' | 'link';
};

/** Resolved note title per `[[wiki]]` target, for `backlinks`/`outlinks`. */
export type McpSnapshotLink = {
	sourceId: string;
	/** Prefixed node id of the resolved target. */
	target: string;
	kind: 'note' | 'task';
};

/** Full snapshot document written to `mcp/snapshot.json`. */
export type McpSnapshot = McpSnapshotMeta & {
	workspaces: McpSnapshotWorkspace[];
	notes: McpSnapshotNote[];
	tasks: McpSnapshotTask[];
	dependencies: McpSnapshotDependency[];
	folders: McpSnapshotFolder[];
	graph: { nodes: McpSnapshotGraphNode[]; edges: McpSnapshotGraphEdge[] };
};

/** Size guards enforced in the app, never in the shim (#D3, Q4). */
export const MCP_MAX_BODY_BYTES = 256 * 1024;
export const MCP_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const MCP_FLAG_BODY_BYTES = 500 * 1024;
export const MCP_MAX_NOTES = 20_000;
export const MCP_MAX_TASKS = 20_000;

/** How long a job may sit in `jobs/` before the shim gives up (#D4). */
export const MCP_JOB_TIMEOUT_MS = 5_000;

export const MCP_DEFAULT_TOOL_TIMEOUT_MS = 5_000;

/** Snapshot older than this while the app runs earns a stale warning (F2). */
export const MCP_STALE_SNAPSHOT_MS = 60_000;

/** How many backup copies of a note body are kept before the oldest is dropped. */
export const MCP_NOTE_BACKUPS = 20;
