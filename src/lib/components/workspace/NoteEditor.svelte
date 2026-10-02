<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { PenLine } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { type EditState, type EditorCommand } from '$lib/content/markdown-editor';
	import { continueList, indentLines } from '$lib/content/markdown-lines';
	import { transform } from '$lib/content/markdown-commands';
	import { shortcutCommand } from '$lib/content/markdown-shortcuts';
	import { clickedCheckboxIndex } from '$lib/content/markdown-preview';
	import { settings, updateSettings, type EditorView } from '$lib/stores/settings.svelte';
	import type { Folder } from '$lib/stores/notes';
	import { toggleChecklistItem } from '$lib/stores/notes';
	import { captureNoteVersion, captureAttachmentVersion, notePatchFromVersion } from '$lib/content/note-versioning';
	import { attachmentReferencesChanged } from '$lib/content/attachment-manager';
	import RecordHistoryDialog from '$lib/components/dialogs/RecordHistoryDialog.svelte';
	import type { EntityVersion } from '$lib/content/version-types';
	import { insertAttachment, attachmentLinkTarget } from '$lib/content/attachments';
	import { pickAttachments, openAttachment } from '$lib/content/attachment-actions';
	import { replaceLineRange, startPreviewLineEdit } from '$lib/content/preview-line-editor';
	import { outlineFor, scrollPreviewToHeading, trackPreviewHeadings } from '$lib/content/preview-toc-sync';
	import type { TocEntry } from '$lib/content/preview-toc';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import type { Task } from '$lib/stores/tasks';
	import { handlePreviewAction } from '$lib/content/preview-actions';
	import { handleExternalLink } from '$lib/content/external-links';
	import { createNotePreviewRenderer } from '$lib/stores/note-preview.svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import NoteHeader from '$lib/components/note/NoteHeader.svelte';
	import NoteEditorBar from '$lib/components/note/NoteEditorBar.svelte';
	import MarkdownGuideDialog from '$lib/components/dialogs/MarkdownGuideDialog.svelte';
	import EditorFormatBar from '$lib/components/workspace/EditorFormatBar.svelte';
	import FileDropZone from '$lib/components/workspace/FileDropZone.svelte';
	import NoteEditorBody from '$lib/components/workspace/NoteEditorBody.svelte';
	import {
		applyWikilink,
		moveSuggestion,
		wikiSuggestionsFor,
		type WikiSuggestion,
		type WikiSuggestionSet
	} from '$lib/content/wiki-autocomplete';
	import { t } from '$lib/i18n/index.svelte';

	type Patch = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder' | 'pinned' | 'overlay'>>;

	const ARCHIVE_FOLDER = 'archive';
	const RESTORE_FOLDER = 'personal';

	let {
		note,
		folders,
		focusToken = 0,
		fullPreview = false,
		onupdate,
		ondelete,
		onprint,
		onexport,
		oncopy,
		onselectfolder,
		ontogglefullpreview,
		notes = [],
		tasks = [],
		customFolders = [],
		onwikilink,
		journal,
	}: {
		note?: Note;
		folders: Folder[];
		focusToken?: number;
		fullPreview?: boolean;
		onupdate: (id: string, patch: Patch) => void;
		ondelete: (id: string) => void;
		onprint?: (note: Note) => void;
		onexport?: (note: Note) => void;
		oncopy?: (note: Note) => void;
		onselectfolder?: (id: string) => void;
		ontogglefullpreview?: () => void;
		notes?: Note[];
		tasks?: Task[];
		customFolders?: { id: string; label: string }[];
		onwikilink?: (click: WikiClick) => void;
		/** Day navigation, shown only when the open note is a journal entry. */
		journal?: { previous: string | null; next: string | null; onstep: (day: string) => void };
	} = $props();

	let title = $state('');
	let draft = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let previewEl = $state<HTMLDivElement>();
	let guideOpen = $state(false);
	let historyOpen = $state(false);
	let moveFolder = $state('');
	let viewOverride = $state<{ id: string; view: EditorView } | null>(null);
	let suggestions = $state<WikiSuggestionSet | null>(null);
	let activeIndex = $state(0);
	let tocEntries = $state<TocEntry[]>([]), tocActive = $state(-1);
	/** Workspace-scoped pools, so the popover offers what a link can reach. */
	const wikiContext = $derived({
		source: note ?? { id: '', title: '', folder: '' },
		notes: notes.filter(scopeToNote),
		tasks: tasks.filter(scopeToNote),
		folders: customFolders
	});

	function scopeToNote(item: { workspaceId?: string }): boolean {
		const id = note?.workspaceId ?? 'workspace-default';
		return (item.workspaceId ?? 'workspace-default') === id;
	}

	/** Recomputes the query from the live caret. */
	function refreshSuggestions() {
		const el = textareaEl;
		if (!el || view === 'preview') {
			suggestions = null;
			return;
		}
		const next = wikiSuggestionsFor(draft, el.selectionStart, wikiContext);
		suggestions = next?.items.length ? next : null;
		activeIndex = next?.items.length ? next.index : 0;
	}

	function choose(item: WikiSuggestion) {
		const current = suggestions;
		if (!current) return;
		const next = applyWikilink(draft, current.query, item.entity, current.query);
		suggestions = null;
		applyEdit({ value: next.value, start: next.caret, end: next.caret });
	}

	/**
	 * Recomputes the query from the live caret. Keyups the popover consumed are
	 * skipped: after `Enter` the caret sits past the inserted link, and
	 * refreshing there would immediately reopen the list.
	 */
	function refreshFromKeyup(event: KeyboardEvent) {
		if (event.key.startsWith('Arrow') || event.key === 'Escape') return;
		if (event.key === 'Enter' || event.key === 'Tab') return;
		refreshSuggestions();
	}

	/** Popover keys win over the editor's own Enter/Tab/Escape handling. */
	function handlePopoverKey(event: KeyboardEvent): boolean {
		const items = suggestions?.items ?? [];
		if (!items.length) return false;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = moveSuggestion(activeIndex, items.length, event.key === 'ArrowDown' ? 1 : -1);
			return true;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			choose(items[activeIndex] ?? items[0]);
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			suggestions = null;
			return true;
		}
		return false;
	}

	const view = $derived(
		fullPreview
			? 'preview'
			: viewOverride && viewOverride.id === note?.id
				? viewOverride.view
				: settings.editorView
	);
	const folderLabel = $derived(
		folders.find((folder) => folder.id === note?.folder)?.label ?? note?.folder ?? ''
	);
	const folderOptions = $derived(
		folders
			.filter((folder) => folder.id !== 'all' && folder.id !== note?.folder)
			.map((folder) => ({ value: folder.id, label: folder.label }))
	);
	/**
	 * The open note's rendered preview HTML and "still rendering" flag. Keyed on
	 * the note id, so editing the body in place never re-shows the skeleton, but
	 * switching notes does until the new body is ready.
	 */
	const preview = createNotePreviewRenderer(() => ({
		note,
		notes,
		tasks,
		customFolders,
		inlineEdit: settings.previewInlineEdit,
		view,
	}));
	/** Skeletons only when a preview pane is shown, not in Write-only mode. */
	const previewLoading = $derived(preview.rendering && view !== 'write');

	function moveToFolder(folder: string) {
		if (!note || folder === note.folder) return;
		onupdate(note.id, { folder });
		moveFolder = '';
	}

	$effect(() => {
		title = note?.title ?? '';
		draft = note?.body ?? '';
	});

	$effect(() => {
		const token = focusToken;
		if (!token) return;
		untrack(() => {
			if (!note) return;
			if (fullPreview) ontogglefullpreview?.();
			if (settings.editorView === 'preview') {
				viewOverride = { id: note.id, view: 'write' };
			}
			void tick().then(() => {
				textareaEl?.focus();
				const end = textareaEl?.value.length ?? 0;
				textareaEl?.setSelectionRange(end, end);
			});
		});
	});

	/** Outline of the rendered preview, with the reading position from its scroll. */
	$effect(() => {
		const root = previewEl;
		tocEntries = root ? outlineFor(root, preview.html) : [];
		tocActive = -1;
		if (!root) return;
		return trackPreviewHeadings(root, (index) => {
			tocActive = index;
		});
	});
	/** Jumps the preview to the heading the reader picked in the outline. */
	function scrollToHeading(slug: string) {
		if (previewEl) scrollPreviewToHeading(previewEl, slug);
	}
	function commitBody(value: string) {
		if (!note) return;
		const previousBody = draft;
		draft = value;
		// History is best-effort; the pre-image is the current note state.
		// An edit that changes which attachments are referenced always earns a
		// version (even inside the time-gap window), so a link removed from the
		// body can be recovered; `previousBody` is the exact pre-edit body.
		if (settings.versioningEnabled) {
			if (attachmentReferencesChanged(previousBody, value)) {
				captureAttachmentVersion({ ...note, body: previousBody });
			} else {
				captureNoteVersion(note);
			}
		}
		onupdate(note.id, { body: value });
	}

	/** Applies a saved version through the normal save path (so it is versioned). */
	function restoreVersion(version: EntityVersion) {
		if (!note) return;
		const patch = notePatchFromVersion(version);
		if (patch.body !== undefined) draft = patch.body;
		onupdate(note.id, patch);
	}

	function editorState(): EditState | null {
		const el = textareaEl;
		if (!el) return null;
		return { value: draft, start: el.selectionStart, end: el.selectionEnd };
	}

	function applyEdit(next: EditState) {
		commitBody(next.value);
		requestAnimationFrame(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(next.start, next.end);
		});
	}

	function runCommand(command: EditorCommand) {
		const current = editorState();
		if (!current) return;
		const next = transform(current, command);
		if (next) applyEdit(next);
	}

	/** Applies AI-generated text to the body and restores the caret. */
	function applyAi(nextBody: string, caret: number) {
		applyEdit({ value: nextBody, start: caret, end: caret });
	}

	function onEditorKeydown(event: KeyboardEvent) {
		if (suggestions?.items.length && handlePopoverKey(event)) return;

		if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
			const current = editorState();
			if (!current) return;
			const next = continueList(current);
			if (!next) return;
			event.preventDefault();
			event.stopPropagation();
			applyEdit(next);
			return;
		}

		if (event.key === 'Tab') {
			const current = editorState();
			if (!current) return;
			const next = indentLines(current, event.shiftKey);
			if (!next) return;
			event.preventDefault();
			event.stopPropagation();
			applyEdit(next);
			return;
		}

		const command = shortcutCommand(event);
		if (!command) return;
		event.preventDefault();
		event.stopPropagation();
		runCommand(command);
	}

	function changeView(next: EditorView) {
		viewOverride = null;
		if (fullPreview) ontogglefullpreview?.();
		updateSettings({ editorView: next });
	}

	const archived = $derived(note?.folder === ARCHIVE_FOLDER);

	function toggleArchive() {
		if (!note) return;
		onupdate(note.id, { folder: archived ? RESTORE_FOLDER : ARCHIVE_FOLDER });
	}

	function syncSplitScroll(source: HTMLElement, target: HTMLElement) {
		const sourceRange = source.scrollHeight - source.clientHeight;
		const targetRange = target.scrollHeight - target.clientHeight;
		target.scrollTop = sourceRange > 0 ? (source.scrollTop / sourceRange) * targetRange : 0;
	}

	function onEditorScroll() {
		if (view === 'split' && textareaEl && previewEl) syncSplitScroll(textareaEl, previewEl);
	}

	function onPreviewScroll() {
		if (view === 'split' && textareaEl && previewEl) syncSplitScroll(previewEl, textareaEl);
	}

	async function togglePreviewCheckbox(event: MouseEvent) {
		if (!previewEl) return;
		if (await handlePreviewAction(event, previewEl)) return;
		if (await handleAttachmentLinkClick(event, previewEl)) return;
		if (handleExternalLink(event, previewEl)) return;
		const wikiClick = wikiClickFromTarget(event.target, previewEl);
		if (wikiClick) {
			event.preventDefault();
			onwikilink?.(wikiClick);
			return;
		}
		const index = clickedCheckboxIndex(previewEl, event.target);
		if (index >= 0) {
			if (!note) return;
			event.preventDefault();
			commitBody(toggleChecklistItem(draft, index));
			return;
		}
		startLineEdit(event);
	}

	/** Opens the in-place editor for the clicked preview block, when enabled. */
	function startLineEdit(event: MouseEvent) {
		if (!previewEl || !note) return;
		if (!settings.previewInlineEdit || view !== 'preview') return;
		const source = draft;
		startPreviewLineEdit(event, previewEl, source, (value, block) => {
			commitBody(replaceLineRange(source, block, value));
		});
	}

	function attachMarkdown(markdown: string) {
		if (!note || !markdown) return;
		const editing = view === 'write' || view === 'split';
		const current =
			editing && textareaEl
				? { value: draft, start: textareaEl.selectionStart, end: textareaEl.selectionEnd }
				: { value: draft, start: draft.length, end: draft.length };
		const next = insertAttachment(current.value, current.start, current.end, markdown);
		commitBody(next.value);
		void tick().then(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(next.start, next.end);
		});
	}

	/** Attaches a file chosen from the native picker (or an image for the toolbar). */
	async function pickAndAttach(kind: 'image' | 'file') {
		if (!note) return;
		const markdown = await pickAttachments(kind).catch(() => '');
		if (markdown) attachMarkdown(markdown);
	}

	/**
	 * Opens a clicked attachment link (a stored blob or a legacy local file) with
	 * the OS default app, instead of navigating the webview to it.
	 */
	async function handleAttachmentLinkClick(event: MouseEvent, root: HTMLElement): Promise<boolean> {
		const target = attachmentLinkTarget(event.target, root);
		if (!target) return false;
		event.preventDefault();
		event.stopPropagation();
		await openAttachment(target);
		return true;
	}
</script>

<main class="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
	<FileDropZone class="relative z-10 flex min-h-0 flex-1 flex-col" onmarkdown={attachMarkdown}>
		{#snippet children(droppable)}
			{#if droppable && note}
				<div
					class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface-container/40 backdrop-blur-[2px]"
				>
					<div
						class="glass-solid rounded-full px-4 py-2 text-label-md font-label text-on-surface"
					>
						Drop files to attach
					</div>
				</div>
			{/if}
			<div class="relative flex min-h-0 flex-1 flex-col">
				{#if note}
			<NoteEditorBar
				{note}
				{view}
				{fullPreview}
				{archived}
				loading={previewLoading}
				onview={changeView}
				ontogglepin={() => onupdate(note.id, { pinned: !note.pinned })}
				ontoggledock={() => onupdate(note.id, { overlay: !note.overlay })}
				ontogglearchive={toggleArchive}
				onprint={() => onprint?.(note)}
				onexport={() => onexport?.(note)}
				oncopy={() => oncopy?.(note)}
				ondelete={() => ondelete(note.id)}
				onfullpreview={() => ontogglefullpreview?.()}
				onhistory={settings.versioningEnabled ? () => (historyOpen = true) : undefined}
			/>

			{#if !fullPreview}
				<NoteHeader
					{note}
					bind:title
					draft={draft}
					textarea={textareaEl}
					{folderLabel}
					{folderOptions}
					bind:moveFolder
					onmovefolder={moveToFolder}
					{onselectfolder}
					onupdatetitle={(value) => onupdate(note.id, { title: value })}
					onupdatetags={(tags) => onupdate(note.id, { tags })}
					onapplyai={applyAi}
					{journal}
				/>
			{/if}

			{#if view !== 'preview'}
				<EditorFormatBar oncommand={runCommand} onattach={pickAndAttach} onguide={() => (guideOpen = true)} />
			{/if}

			<NoteEditorBody
				{view}
				{draft}
				html={preview.html}
				spellcheck={settings.spellcheck}
				{suggestions}
				{activeIndex}
				find
				{tocEntries}
				{tocActive}
				bind:textareaEl
				bind:previewEl
				loading={previewLoading}
				oninput={(value) => {
					commitBody(value);
					refreshSuggestions();
				}}
				onkeydown={onEditorKeydown}
				onkeyup={refreshFromKeyup}
				onclickeditor={refreshSuggestions}
				onblur={() => (suggestions = null)}
				oneditorscroll={onEditorScroll}
				onpreviewscroll={onPreviewScroll}
				onpreviewclick={togglePreviewCheckbox}
				onchoose={choose}
				onhover={(position) => (activeIndex = position)}
				ontocselect={scrollToHeading}
			/>
		{:else}
			<EmptyState
				size="lg"
				icon={PenLine}
				heading={t('notes.editor.noNoteSelected')}
				title={t('notes.editor.noNoteSelectedHint')}
			/>
		{/if}
			</div>
		{/snippet}
	</FileDropZone>

	<MarkdownGuideDialog bind:open={guideOpen} />
	{#if note}
		<RecordHistoryDialog
			bind:open={historyOpen}
			entity="note"
			entityId={note.id}
			onrestore={restoreVersion}
		/>
	{/if}
</main>
