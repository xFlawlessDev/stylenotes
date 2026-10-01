/**
 * Shared contract for the local MCP bridge (docs/design/mcp-local-free.md).
 *
 * Everything here is pure data: protocol version, snapshot shapes, tool
 * descriptors, and the job/result envelopes exchanged through the file bridge
 * in the app data directory. Keeping it in one module means the Rust shim and
 * the TS host cannot drift on field names.
 */

/**
 * Bumped whenever the bridge or snapshot shape changes incompatibly.
 *
 * v2 (#D19): the snapshot gained `today`, the user's civil date. The shim
 * requires it for date comparisons, so a v1 app gets `protocol_mismatch` and an
 * "update StyleNotes" message instead of quietly comparing against the UTC day.
 *
 * v3: `truncated` stopped meaning "index-only". Bodies are withheld per note
 * and flagged with `McpSnapshotNote.truncated`, while the new `indexOnly` says
 * whether none shipped at all — a v2 reader takes `truncated: true` as "no
 * bodies anywhere", which would hide content that is right there. The split is
 * what lets one oversized note stop punishing the whole workspace.
 */
export const MCP_PROTOCOL = 3;

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
	| 'last_workspace'
	| 'write_failed'
	| 'tool_failed'
	| 'timeout';

export type McpScope = 'notes' | 'tasks' | 'dependency' | 'workspace';

/**
 * Every scope the bridge knows, in display order. The single source of truth:
 * the tool registry groups by it, the settings layer validates against it, and
 * the shim mirrors the resulting tool list. A second, hardcoded copy in any of
 * those places is how a scope silently disappears.
 */
export const MCP_SCOPE_IDS: readonly McpScope[] = ['notes', 'tasks', 'dependency', 'workspace'];

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
	/** Origin machine for a remote call (#D12); empty for stdio. */
	remoteAddr: string;
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
	/**
	 * The user's civil date as `YYYY-MM-DD`, in the configured timezone (#D19).
	 *
	 * `generatedAt` is UTC; comparing a task's `dueAt` against its first ten
	 * characters is wrong for anyone east or west of UTC, where the local day
	 * differs from the UTC day for part of every day. Every date comparison the
	 * shim makes MUST use this field, not `generatedAt`.
	 */
	today: string;
	/**
	 * Some content was left out: a capped list, a cut body, or a body withheld
	 * by the size budget. Never means "no bodies" on its own — that is
	 * `indexOnly`. Readers must surface it, or a withheld body reads as an
	 * empty note.
	 */
	truncated: boolean;
	/**
	 * True only when **no** note carries a body, i.e. bodies were dropped
	 * wholesale to fit the budget. A note with `truncated: true` but no
	 * `indexOnly` around it still has its (possibly cut) text.
	 */
	indexOnly: boolean;
	appRunning: boolean;
	/** Why the snapshot was trimmed, when it was: `note_count`, `task_count`, `body_size` or `snapshot_size`. */
	truncatedReason?: string;
};

/** Per-note entry in the snapshot. Body is omitted when withheld. */
export type McpSnapshotNote = {
	id: string;
	workspaceId: string;
	title: string;
	folder: string;
	tags: string[];
	pinned: boolean;
	overlay: boolean;
	excerpt: string;
	/**
	 * Absent when the body was withheld (index-only mode or the size budget).
	 * Never `undefined` because a note is empty: an empty note carries `''`.
	 * That distinction is the whole point — a missing body must be reportable.
	 */
	body?: string;
	/**
	 * Set when `body` is missing or cut short at `MCP_MAX_BODY_BYTES`. Tells
	 * the reader there is more text than was loaded, so "no body" is never
	 * mistaken for "nothing there".
	 */
	truncated?: boolean;
	/** Epoch milliseconds. Both come from the DB columns, never the display `updated` (#D13, #D17). */
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

/**
 * Size guards enforced in the app, never in the shim (#D3, Q4).
 *
 * A body over `MCP_MAX_BODY_BYTES` is cut on a line boundary and flagged
 * `truncated`; it no longer throws the whole snapshot into index-only mode.
 * Which bodies ship at all is then decided once, against
 * `MCP_MAX_SNAPSHOT_BYTES`.
 */
export const MCP_MAX_BODY_BYTES = 256 * 1024;
export const MCP_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export const MCP_MAX_NOTES = 20_000;
export const MCP_MAX_TASKS = 20_000;

/** How long a job may sit in `jobs/` before the shim gives up (#D4). */
export const MCP_JOB_TIMEOUT_MS = 5_000;

export const MCP_DEFAULT_TOOL_TIMEOUT_MS = 5_000;

/** Snapshot older than this while the app runs earns a stale warning (F2). */
export const MCP_STALE_SNAPSHOT_MS = 60_000;

/** How many backup copies of a note body are kept before the oldest is dropped. */
export const MCP_NOTE_BACKUPS = 20;
