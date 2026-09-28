import type { Note } from '$lib/content/content';
import type { EntityVersion } from '$lib/content/version-types';
import { versioning } from '$lib/stores/versioning';

/**
 * Version-history glue for a note editor. Kept out of the components so both
 * the workspace editor and the note detail window share one implementation.
 */

/** The editable note fields a version restores. */
export type NoteVersionPatch = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder'>>;

/** Saves the pre-edit note as a version. Best-effort; never blocks the save. */
export function captureNoteVersion(note: Note): void {
	void versioning.captureNote(note);
}

/** The editable fields a note version restores. */
export function notePatchFromVersion(version: EntityVersion): NoteVersionPatch {
	const payload = version.payload as Partial<Note>;
	return {
		title: payload.title,
		body: payload.body,
		tags: payload.tags,
		folder: payload.folder,
	};
}
