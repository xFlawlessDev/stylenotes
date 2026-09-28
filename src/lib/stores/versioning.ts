import { browser } from '$app/environment';
import { versionsRepo } from '$lib/db/versions';
import {
	noteVersionPayload,
	taskVersionPayload,
	type EntityVersion,
	type VersionEntity,
	type VersionPayload,
	type VersionReason,
} from '$lib/content/version-types';
import type { Note } from '$lib/content/content';
import type { Task } from '$lib/stores/tasks';
import {
	selectVersionsToKeep,
	shouldSnapshot,
	VERSION_HARD_CAP,
	VERSION_MAX_BYTES,
} from '$lib/content/version-retention';
import { isTauri } from '$lib/windows';

/** Serialized size guard: oversized values skip versioning rather than bloat the DB. */
function tooLarge(payload: VersionPayload): boolean {
	try {
		return JSON.stringify(payload).length > VERSION_MAX_BYTES;
	} catch {
		return true;
	}
}

/**
 * Saves a pre-edit snapshot of a record when the time-gap rule says it matters,
 * then prunes old versions. Best-effort: a version failure never blocks the
 * actual save. Returns whether a version was written.
 */
export async function captureVersion(
	entity: VersionEntity,
	entityId: string,
	payload: VersionPayload,
	reason: VersionReason = 'auto',
	now = Date.now()
): Promise<boolean> {
	if (!browser || !isTauri || tooLarge(payload)) return false;
	try {
		const latest = await versionsRepo.latest(entity, entityId);
		const lastLength = latest ? JSON.stringify(latest.payload).length : 0;
		const currentLength = JSON.stringify(payload).length;
		const wanted = shouldSnapshot({
			lastVersionAt: latest?.updatedAt ?? null,
			lastLength,
			currentLength,
			now,
			reason,
		});
		if (!wanted) return false;
		const version: EntityVersion = {
			id: crypto.randomUUID(),
			entity,
			entityId,
			payload,
			updatedAt: now,
			reason,
			createdAt: new Date(now).toISOString(),
		};
		const stored = await versionsRepo.insert(version);
		if (stored) await pruneVersions(entity, entityId, now);
		return stored;
	} catch {
		return false;
	}
}

/** Applies the retention policy for one record. Never throws to callers. */
export async function pruneVersions(
	entity: VersionEntity,
	entityId: string,
	now = Date.now()
): Promise<void> {
	try {
		const all = await versionsRepo.list(entity, entityId, 1000);
		if (all.length <= VERSION_HARD_CAP) return;
		const keep = selectVersionsToKeep(all, now);
		const doomed = all.filter((version) => !keep.has(version.id)).map((version) => version.id);
		await versionsRepo.removeMany(doomed);
	} catch {
		/* pruning is best-effort */
	}
}

export const versioning = {
	captureNote(note: Note, reason: VersionReason = 'auto', now?: number) {
		return captureVersion('note', note.id, noteVersionPayload(note), reason, now);
	},
	captureTask(task: Task, reason: VersionReason = 'auto', now?: number) {
		return captureVersion('task', task.id, taskVersionPayload(task), reason, now);
	},
	list(entity: VersionEntity, entityId: string) {
		return versionsRepo.list(entity, entityId);
	},
	latest(entity: VersionEntity, entityId: string) {
		return versionsRepo.latest(entity, entityId);
	},
	removeAll(entity: VersionEntity, entityId: string) {
		return versionsRepo.removeAll(entity, entityId);
	},
};
