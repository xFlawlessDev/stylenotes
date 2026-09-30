/**
 * Note CRUD operations for the workspace controller.
 *
 * Extracted for the same reason as `workspace-folder-ops.ts` and
 * `workspace-journal-ops.ts`: the controller coordinates, and each concern gets
 * a testable seam. This module owns creating, patching and deleting a note,
 * including the debounce that keeps typing from hammering the database.
 *
 * Dependencies are injected getters/setters, so the state it touches is the
 * live `$state` object and this module stays free of Svelte imports.
 */

import { createNote as makeNote, type Note } from '$lib/content/content';
import { applyNotePatch, persistNote, removeNote, type NotePatch } from '$lib/stores/notes';
import { t } from '$lib/i18n/index.svelte';
import type { WorkspaceSection } from '$lib/windows';

/** How long typing pauses before a note is written. */
const PERSIST_DEBOUNCE_MS = 250;

export type NoteOps = {
	/** Opens the create-note dialog. */
	openCreate: () => void;
	/** Persists a freshly created note and selects it. */
	commitNew: (data: { title: string; folder: string; body: string }) => Promise<void>;
	/** Patches a note in state and schedules a debounced save. */
	update: (id: string, patch: NotePatch) => void;
	/** Deletes, asking first when the user wants confirmation. */
	remove: (id: string) => void;
	/** Deletes without asking. */
	performRemove: (id: string) => void;
	/** Cancels any pending debounced save, e.g. before a reset. */
	cancelPending: () => void;
};

export function createNoteOps(deps: {
	get items(): Note[];
	set items(value: Note[]);
	get selectedId(): string;
	set selectedId(value: string);
	get newNoteToken(): number;
	set newNoteToken(value: number);
	get activeFolder(): string;
	set activeFolder(value: string);
	get activeTag(): string | null;
	set activeTag(value: string | null);
	set section(value: WorkspaceSection);
	get pendingDelete(): Note | null;
	set pendingDelete(value: Note | null);
	get deleteOpen(): boolean;
	set deleteOpen(value: boolean);
	get createOpen(): boolean;
	set createOpen(value: boolean);
	get confirmDelete(): boolean;
	/** Workspace a new note belongs to. */
	workspaceId: () => string;
	notify: (message: string) => void;
}): NoteOps {
	let persistTimer: ReturnType<typeof setTimeout> | null = null;

	async function persistOrToast(note: Note): Promise<void> {
		const ok = await persistNote(note);
		if (!ok) deps.notify(t('editor.actions.noteSaveFailed'));
	}

	return {
		openCreate: () => {
			deps.createOpen = true;
		},

		async commitNew(data) {
			const note = makeNote({
				...data,
				workspaceId: deps.workspaceId(),
				title: data.title.trim() || 'Untitled note',
			});
			deps.items = [note, ...deps.items];
			deps.selectedId = note.id;
			deps.activeFolder = data.folder;
			deps.activeTag = null;
			deps.newNoteToken += 1;
			deps.section = 'notes';
			deps.notify(t('editor.actions.noteCreated'));
			await persistOrToast(note);
		},

		update(id, patch) {
			let updated: Note | undefined;
			deps.items = deps.items.map((note) => {
				if (note.id !== id) return note;
				updated = applyNotePatch(note, patch);
				return updated;
			});
			if (!updated) return;

			const toSave = updated;
			if (persistTimer) clearTimeout(persistTimer);
			persistTimer = setTimeout(() => {
				persistTimer = null;
				void persistOrToast(toSave);
			}, PERSIST_DEBOUNCE_MS);
		},

		remove(id) {
			if (!deps.confirmDelete) {
				this.performRemove(id);
				return;
			}
			deps.pendingDelete = deps.items.find((note) => note.id === id) ?? null;
			deps.deleteOpen = deps.pendingDelete !== null;
		},

		performRemove(id) {
			deps.items = deps.items.filter((note) => note.id !== id);
			if (deps.selectedId === id) deps.selectedId = deps.items[0]?.id ?? '';
			void removeNote(id);
			deps.notify(t('editor.actions.noteDeleted'));
		},

		cancelPending() {
			if (persistTimer) clearTimeout(persistTimer);
			persistTimer = null;
		},
	};
}
