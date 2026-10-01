/**
 * Wire DTOs — the *sync* shape of a record, distinct from the desktop app's
 * in-memory `Note`/`Task`. Derived fields (excerpt, word counts, display
 * timestamps) are recomputed on each side and never travel over the wire.
 *
 * Kept here so the cloud service can validate a payload without importing the
 * desktop app, and so the app can serialise a row without importing the server.
 */

export type WireNote = {
	id: string;
	workspaceId: string;
	title: string;
	folder: string;
	tags: string[];
	pinned: boolean;
	overlay: boolean;
	body: string;
	/** Civil day for a journal entry (`YYYY-MM-DD`), or null (#J1). */
	journalDay: string | null;
	/** Epoch ms; the machine-readable timestamp (#D13). */
	updatedAt: number;
	/** Epoch ms of the first write. */
	createdAt: number;
};

export type WireTask = {
	id: string;
	workspaceId: string;
	title: string;
	notes: string;
	status: 'todo' | 'doing' | 'review' | 'done';
	priority: 'low' | 'medium' | 'high';
	folder: string;
	noteIds: string[];
	startAt: string | null;
	dueAt: string | null;
	position: number;
	completed: boolean;
	overlay: boolean;
};

export type WireFolder = {
	id: string;
	label: string;
	workspaceId: string;
	position: number;
};

/** Preference keys that are meaningful across devices (§3.3, #24). */
export type WireSettings = {
	mode: 'dark' | 'light';
	accent: string;
	density: string;
	editorView: string;
	spellcheck: boolean;
	focusMode: boolean;
	showWordCount: boolean;
	confirmDelete: boolean;
	reduceMotion: boolean;
};
