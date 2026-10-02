import type { Note } from '$lib/content/content';
import type { Task } from '$lib/stores/tasks';

/** Which record a version belongs to. */
export type VersionEntity = 'note' | 'task';

/** Why a version was captured. */
export type VersionReason = 'auto' | 'manual' | 'pre-mcp' | 'close' | 'attachment' | 'vault';

/**
 * Fields a version stores. Derived values (`words`, `chars`, `excerpt`) are not
 * kept — they are recomputed from the payload on restore.
 */
export type NoteVersionPayload = Pick<Note, 'title' | 'body' | 'tags' | 'folder'>;
export type TaskVersionPayload = Pick<
	Task,
	'title' | 'notes' | 'status' | 'priority' | 'folder' | 'noteIds' | 'startAt' | 'dueAt'
>;
export type VersionPayload = NoteVersionPayload | TaskVersionPayload;

export type EntityVersion = {
	id: string;
	entity: VersionEntity;
	entityId: string;
	payload: VersionPayload;
	/** Epoch ms of the edit this version was taken *before*. */
	updatedAt: number;
	reason: VersionReason;
	createdAt: string;
};

/** Builds the storable payload from a record, dropping derived fields. */
export function noteVersionPayload(note: Note): NoteVersionPayload {
	return { title: note.title, body: note.body, tags: [...note.tags], folder: note.folder };
}

export function taskVersionPayload(task: Task): TaskVersionPayload {
	return {
		title: task.title,
		notes: task.notes,
		status: task.status,
		priority: task.priority,
		folder: task.folder,
		noteIds: [...task.noteIds],
		startAt: task.startAt,
		dueAt: task.dueAt,
	};
}
