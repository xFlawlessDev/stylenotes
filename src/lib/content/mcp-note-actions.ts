/**
 * Note write actions for MCP tool calls (docs/design/mcp-local-free.md #D2, #D17, #D18).
 *
 * Three levels of granularity, on purpose:
 *   - `update_note`       — metadata only (title, folder, tags, pinned).
 *   - `edit_note_body`    — targeted, in-place edit. The token-saving path: an
 *                           agent sends a needle, not the whole note.
 *   - `update_note_body`  — whole-body replacement, for a rewrite.
 *
 * They stay separate tools so that one payload cannot mean "send 40 KB" or
 * "send 120 bytes" depending on which field happens to be set — that ambiguity
 * is how a model mis-calls a tool.
 *
 * These run in the always-alive `workspace` window, not in the shim. They go
 * through repositories with an explicit `workspaceId` (the stores are
 * workspace-scoped and would write to the wrong workspace) and emit the same
 * `*-changed` events the UI already listens for.
 */

import { buildExcerpt, countWords, createNote } from '$lib/content/content';
import { formatRelative } from '$lib/content/version-format';
import {
	applyInsert,
	applyReplace,
	isInsertPosition,
	isOccurrence,
	type BodyEdit
} from '$lib/content/mcp-body-edit';
import {
	fail,
	noteOrError,
	notify,
	resolveWorkspace,
	workspaceGone,
	type WriteContext,
	type WriteOutcome
} from '$lib/content/mcp-write-context';
import { notesRepo } from '$lib/db';
import { NOTES_CHANGED } from '$lib/stores/notes';
import { localToday } from '$lib/stores/settings.svelte';

// --- create -----------------------------------------------------------------

export type CreateNoteArgs = {
	title?: unknown;
	body?: unknown;
	folder?: unknown;
	tags?: unknown;
	workspace?: string;
};

export async function createNoteAction(
	context: WriteContext,
	args: CreateNoteArgs
): Promise<WriteOutcome> {
	const workspace = resolveWorkspace(context, args.workspace);
	if (!workspace.ok) return workspace;
	const note = createNote({
		title: typeof args.title === 'string' ? args.title : undefined,
		body: typeof args.body === 'string' ? args.body : undefined,
		folder: typeof args.folder === 'string' ? args.folder : undefined,
		tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
		workspaceId: workspace.id,
		updatedAt: Date.now(),
	});
	note.updated = formatRelative(note.updatedAt ?? Date.now());
	try {
		await notesRepo.upsert(note);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { note: { id: note.id, workspaceId: note.workspaceId, title: note.title } } };
}

// --- whole-body replacement -------------------------------------------------

export type UpdateNoteBodyArgs = { id?: unknown; body?: unknown; workspace?: string };

/**
 * Replaces a note body. The host writes a backup first (§13a), so this stays a
 * plain, validated mutation.
 */
export async function updateNoteBodyAction(
	context: WriteContext,
	args: UpdateNoteBodyArgs
): Promise<WriteOutcome> {
	if (typeof args.body !== 'string') return fail('bad_arguments', '`body` is required.');
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
	const updatedAt = Date.now();
	const next = {
		...note,
		body: args.body,
		excerpt: buildExcerpt(args.body),
		words: countWords(args.body),
		chars: args.body.length,
		updated: formatRelative(updatedAt),
		updatedAt,
	};
	try {
		await notesRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { note: { id: next.id, workspaceId: next.workspaceId, chars: next.chars } } };
}

// --- targeted edit (#D18) ---------------------------------------------------

export type EditNoteBodyArgs = {
	id?: unknown;
	op?: unknown;
	find?: unknown;
	replace?: unknown;
	text?: unknown;
	occurrence?: unknown;
	position?: unknown;
	workspace?: string;
};

/**
 * The pure transform for one `edit_note_body` call, or a coded refusal.
 *
 * Split out so the "does this apply?" question is answered before anything is
 * written: a refusal must never leave a half-applied edit behind.
 */
export function resolveBodyEdit(args: EditNoteBodyArgs, body: string): BodyEdit {
	if (args.op === 'replace') {
		const occurrence = args.occurrence ?? 'all';
		if (!isOccurrence(occurrence)) {
			return { ok: false, error: 'bad_arguments', message: '`occurrence` must be "once" or "all".' };
		}
		if (typeof args.find !== 'string') {
			return { ok: false, error: 'bad_arguments', message: '`find` is required.' };
		}
		if (typeof args.replace !== 'string') {
			return { ok: false, error: 'bad_arguments', message: '`replace` is required.' };
		}
		return applyReplace(body, args.find, args.replace, occurrence);
	}
	if (args.op === 'insert') {
		const position = args.position ?? 'end';
		if (!isInsertPosition(position)) {
			return { ok: false, error: 'bad_arguments', message: '`position` must be "start" or "end".' };
		}
		if (typeof args.text !== 'string') {
			return { ok: false, error: 'bad_arguments', message: '`text` is required.' };
		}
		return applyInsert(body, args.text, position);
	}
	return { ok: false, error: 'bad_arguments', message: '`op` must be "replace" or "insert".' };
}

/**
 * Applies a targeted body edit: `replace` for sweeps (rename, version bump),
 * `insert` to grow a note without reading it.
 *
 * `matched`/`replaced` come back in the result so the agent can verify the edit
 * without a follow-up `get_note` — that re-read is where the token saving would
 * otherwise be lost.
 */
export async function editNoteBodyAction(
	context: WriteContext,
	args: EditNoteBodyArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	if (typeof args.op !== 'string') return fail('bad_arguments', '`op` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;

	const edit = resolveBodyEdit(args, note.body);
	if (!edit.ok) return fail(edit.error, edit.message);

	const updatedAt = Date.now();
	const next = {
		...note,
		body: edit.body,
		excerpt: buildExcerpt(edit.body),
		words: countWords(edit.body),
		chars: edit.body.length,
		updated: formatRelative(updatedAt),
		updatedAt,
	};
	try {
		await notesRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return {
		ok: true,
		data: {
			note: { id: next.id, workspaceId: next.workspaceId, chars: next.chars },
			op: args.op,
			matched: edit.matched,
			replaced: edit.replaced,
		},
	};
}

// --- metadata patch (#D17) --------------------------------------------------

/**
 * Metadata-only patch for a note: title, folder, tags, pinned.
 *
 * `update_note_body` owns the prose; this owns everything around it, so an
 * agent that captured a note into the wrong folder or without tags can fix it
 * afterwards (#D17). An absent key means "leave it"; `null` is ignored too,
 * because there is no meaningful null for a title or a folder.
 */
export type NotePatch = {
	title?: string;
	folder?: string;
	tags?: string[];
	pinned?: boolean;
};

export type UpdateNoteArgs = { id?: unknown; patch?: unknown; workspace?: string };

export function sanitizeNotePatch(raw: Record<string, unknown>): NotePatch {
	const patch: NotePatch = {};
	if (typeof raw.title === 'string' && raw.title.trim()) patch.title = raw.title.trim();
	if (typeof raw.folder === 'string' && raw.folder.trim()) patch.folder = raw.folder.trim();
	if (Array.isArray(raw.tags)) {
		patch.tags = [
			...new Set(raw.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))
		];
	}
	if (typeof raw.pinned === 'boolean') patch.pinned = raw.pinned;
	return patch;
}

/**
 * True when the patch asks for a title that is blank.
 *
 * A blank title is rejected rather than dropped: dropping it would turn the call
 * into a silent no-op that still reports success, and a model that meant to
 * rename a note has no way to notice.
 */
export function hasBlankTitle(raw: unknown): boolean {
	if (!raw || typeof raw !== 'object') return false;
	const title = (raw as Record<string, unknown>).title;
	return typeof title === 'string' && !title.trim();
}

export async function updateNoteAction(
	context: WriteContext,
	args: UpdateNoteArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
	if (!args.patch || typeof args.patch !== 'object') {
		return fail('bad_arguments', '`patch` is required.');
	}
	if (hasBlankTitle(args.patch)) {
		return fail('bad_arguments', '`title` must not be empty.');
	}
	const patch = sanitizeNotePatch(args.patch as Record<string, unknown>);
	const next = { ...note, ...patch };
	// A note cannot be without a title, and an empty patch would otherwise
	// report success while changing nothing.
	if (!next.title.trim()) return fail('bad_arguments', '`title` must not be empty.');
	try {
		await notesRepo.upsert(next);
	} catch {
		return fail('write_failed', 'The note could not be saved.');
	}
	await notify(NOTES_CHANGED);
	return {
		ok: true,
		data: {
			note: {
				id: next.id,
				workspaceId: next.workspaceId,
				title: next.title,
				folder: next.folder,
				tags: next.tags,
				pinned: next.pinned
			}
		}
	};
}

// --- journal ----------------------------------------------------------------

export type JournalTodayArgs = { workspace?: string };

export type DeleteNoteArgs = { id?: unknown; workspace?: string };

/**
 * Finds — or starts — the journal entry for the user's **local** today (#J7).
 *
 * Read-or-write in one call, but registered as a write because it may create a
 * note. With only a read grant the tool still does the useful half: it returns
 * the existing entry. Only the create half is refused, which is a better answer
 * than a blanket refusal that would hide the entry that is already there.
 *
 * The day comes from the app's own clock and timezone (#D19), never from the
 * caller: an agent that computed "today" itself is off by one for part of every
 * day outside UTC.
 *
 * The find-or-create body lives in the app store (`openJournalDay`), because it
 * owns the unique-index race handling. This action only maps its result and
 * checks the workspace, so there is still exactly one write path.
 */
export async function journalTodayAction(
	context: WriteContext,
	args: JournalTodayArgs
): Promise<WriteOutcome> {
	if (args.workspace && !context.workspaceIds.has(args.workspace)) {
		return fail('unknown_workspace', `Unknown workspace \`${args.workspace}\`.`);
	}
	const { openJournalDay } = await import('$lib/stores/journal.svelte');
	const result = await openJournalDay(localToday());
	if (result.ok) {
		return {
			ok: true,
			data: {
				created: result.created,
				note: {
					id: result.note.id,
					workspaceId: result.note.workspaceId,
					title: result.note.title,
					journalDay: result.note.journalDay
				}
			}
		};
	}
	if (result.error === 'disabled') {
		// Same shape as `write_not_granted`: a feature the user has not switched
		// on, not a broken request. The message says exactly how to turn it on.
		return fail('mcp_disabled', 'Journal is off. Enable it in Settings → Journal.');
	}
	return fail('write_failed', 'The journal entry could not be opened.');
}

export async function deleteNoteAction(
	context: WriteContext,
	args: DeleteNoteArgs
): Promise<WriteOutcome> {
	if (typeof args.id !== 'string') return fail('bad_arguments', '`id` is required.');
	const found = noteOrError(context, args.id);
	if (!('found' in found)) return found;
	const note = found.found;
	const gone = workspaceGone(context, note.workspaceId);
	if (gone) return gone;
	try {
		await notesRepo.remove(note.id);
	} catch {
		return fail('write_failed', 'The note could not be deleted.');
	}
	await notify(NOTES_CHANGED);
	return { ok: true, data: { deleted: note.id, workspaceId: note.workspaceId } };
}
