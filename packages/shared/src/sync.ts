/**
 * Sync protocol envelope (cloud sync design §4).
 *
 * This module is the single source of truth for what crosses the wire between
 * the desktop app and the cloud service. Both repositories depend on it, so the
 * request and response shapes cannot drift.
 */
import type { Hlc } from './hlc';

/**
 * Bumped when a change is not backward compatible. The client sends its
 * version on `push`; the server rejects an unknown one with `protocol_mismatch`
 * instead of guessing at missing fields.
 */
export const SYNC_PROTOCOL_VERSION = 1;

/** Entities that participate in delta sync. */
export type SyncEntity = 'note' | 'task' | 'folder' | 'settings';

/** A mutation from a device. `delete` carries a tombstone, not a payload. */
export type SyncOp = 'upsert' | 'delete';

export type SyncChange = {
	/** `device_id + seq`; unique per device, so a retry is idempotent. */
	changeId: string;
	entity: SyncEntity;
	entityId: string;
	op: SyncOp;
	/** JSON snapshot at the time of the change; omitted for `delete`. */
	payload?: string;
	hlc: Hlc;
	deviceId: string;
};

export type PushRequest = {
	protocol: number;
	deviceId: string;
	/** The client's `last_pulled_seq`; lets the server detect a lagging client. */
	baseSeq: number;
	changes: SyncChange[];
};

export type PushConflict = {
	entity: SyncEntity;
	entityId: string;
	/** The winning remote record the client lost against (§4.2 step 3). */
	winningHlc: Hlc;
	winningPayload: string | null;
};

export type PushResponse = {
	accepted: string[];
	conflicts: PushConflict[];
	/** The global `changes.seq` after this push (#27). */
	serverSeq: number;
	/** Set when the client is behind the tombstone retention window. */
	needsResync?: boolean;
};

export type PullRequest = {
	since: number;
	limit?: number;
};

export type PullResponse = {
	changes: SyncChange[];
	tombstones: { entity: SyncEntity; entityId: string; deletedAt: number }[];
	nextSeq: number;
	hasMore: boolean;
};

export type SyncErrorCode =
	| 'protocol_mismatch'
	| 'unauthorized'
	| 'needs_resync'
	| 'payload_too_large'
	| 'rate_limited';

export type SyncError = {
	code: SyncErrorCode;
	message: string;
};
