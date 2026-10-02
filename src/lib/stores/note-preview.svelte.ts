import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { Task } from '$lib/stores/tasks';
import type { EditorView } from '$lib/stores/settings.svelte';
import { renderNoteHtml } from '$lib/content/note-actions';
import { annotatePreviewLines } from '$lib/content/preview-lines';
import { enableTaskCheckboxes } from '$lib/content/markdown-preview';
import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';

export type NotePreviewInput = {
	note: Note | undefined;
	notes: Note[];
	tasks: Task[];
	customFolders: CustomFolder[];
	/** `settings.previewInlineEdit`; adds in-place line editing in Preview. */
	inlineEdit: boolean;
	view: EditorView;
};

/**
 * Owns the open note's sanitized preview HTML and the "still rendering" flag.
 *
 * Rendering is async (`renderNoteHtml` runs markdown-it plus Mermaid), so the
 * editor has a window where the toolbar is ready but the body is not. Exposing
 * `rendering` lets `NoteEditorBar`/`NoteEditorBody` show a skeleton for exactly
 * that window. The flag is keyed on the note id, so an edit *within* a note
 * never re-shows the skeleton — only switching notes or the first load does.
 *
 * The factory is called during component initialization; it registers one
 * effect and returns reactive getters.
 */
export function createNotePreviewRenderer(getInput: () => NotePreviewInput) {
	let html = $state('');
	let renderedForId = $state<string | null>(null);

	$effect(() => {
		const input = getInput();
		const source = input.note?.body ?? '';
		const id = input.note?.id ?? null;
		let cancelled = false;

		if (!source) {
			html = '';
			renderedForId = id;
			return;
		}

		const wiki = input.note
			? { source: input.note, notes: input.notes, tasks: input.tasks, folders: input.customFolders }
			: undefined;
		void renderNoteHtml(source, wiki)
			.then(renderNotePreviewHtml)
			.then((rendered) => {
				if (cancelled) return;
				const enabled = enableTaskCheckboxes(rendered);
				html =
					input.inlineEdit && input.view === 'preview'
						? annotatePreviewLines(enabled, source)
						: enabled;
				renderedForId = id;
			})
			.catch(() => {
				if (cancelled) return;
				html = '';
				renderedForId = id;
			});

		return () => {
			cancelled = true;
		};
	});

	return {
		get html(): string {
			return html;
		},
		/** True until the open note's body has rendered once; empty notes never render. */
		get rendering(): boolean {
			const note = getInput().note;
			return !!note && note.body.trim() !== '' && renderedForId !== note.id;
		},
	};
}

export type NotePreviewRenderer = ReturnType<typeof createNotePreviewRenderer>;
