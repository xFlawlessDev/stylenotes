<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { PenLine } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { type EditState, type EditorCommand } from '$lib/content/markdown-editor';
	import { continueList, indentLines } from '$lib/content/markdown-lines';
	import { transform } from '$lib/content/markdown-commands';
	import { shortcutCommand } from '$lib/content/markdown-shortcuts';
	import {
		clickedCheckboxIndex,
		enableTaskCheckboxes,
	} from '$lib/content/markdown-preview';
	import { settings, updateSettings, type EditorView } from '$lib/stores/settings.svelte';
	import type { Folder } from '$lib/stores/notes';
	import { toggleChecklistItem } from '$lib/stores/notes';
	import { insertAttachment, joinAttachmentMarkdown } from '$lib/content/attachments';
	import { renderNoteHtml } from '$lib/content/note-actions';
	import { wikiClickFromTarget, type WikiClick } from '$lib/content/wiki-links';
	import type { Task } from '$lib/stores/tasks';
	import { handlePreviewAction } from '$lib/content/preview-actions';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import { Button, EmptyState, Textarea } from '$lib/components/base';
	import NoteHeader from '$lib/components/note/NoteHeader.svelte';
	import NoteEditorBar from '$lib/components/note/NoteEditorBar.svelte';
	import MarkdownGuideDialog from '$lib/components/dialogs/MarkdownGuideDialog.svelte';
	import EditorFormatBar from '$lib/components/workspace/EditorFormatBar.svelte';
	import FileDropZone from '$lib/components/workspace/FileDropZone.svelte';
	import WikiLinkPopover from '$lib/components/note/WikiLinkPopover.svelte';
	import {
		applyWikilink,
		moveSuggestion,
		wikiSuggestionsFor,
		type WikiSuggestion,
		type WikiSuggestionSet
	} from '$lib/content/wiki-autocomplete';

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
	} = $props();

	let title = $state('');
	let draft = $state('');
	let html = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let previewEl = $state<HTMLDivElement>();
	let guideOpen = $state(false);
	let moveFolder = $state('');
	let viewOverride = $state<{ id: string; view: EditorView } | null>(null);
	let suggestions = $state<WikiSuggestionSet | null>(null);
	let activeIndex = $state(0);

	/** Workspace-scoped pools, so the popover offers what a link can reach. */
	const wikiContext = $derived({
		source: note ?? { id: '', title: '', folder: '' },
		notes: notes.filter(scopeToNote),
		tasks: tasks.filter(scopeToNote),
		folders: customFolders
	});

	const open = $derived(!!suggestions?.items.length);

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

	$effect(() => {
		const source = note?.body ?? '';
		let cancelled = false;

		if (!source) {
			html = '';
			return;
		}

		const wiki = note ? { source: note, notes, tasks, folders: customFolders } : undefined;
		void renderNoteHtml(source, wiki).then(renderNotePreviewHtml)
			.then((rendered) => {
				if (!cancelled) html = enableTaskCheckboxes(rendered);
			})
			.catch(() => {
				if (!cancelled) html = '';
			});

		return () => {
			cancelled = true;
		};
	});

	function commitBody(value: string) {
		if (!note) return;
		draft = value;
		onupdate(note.id, { body: value });
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
		const wikiClick = wikiClickFromTarget(event.target, previewEl);
		if (wikiClick) {
			event.preventDefault();
			onwikilink?.(wikiClick);
			return;
		}
		if (!note) return;
		const index = clickedCheckboxIndex(previewEl, event.target);
		if (index < 0) return;
		event.preventDefault();
		commitBody(toggleChecklistItem(draft, index));
	}

	function attachFiles(paths: string[]) {
		if (!note || !paths.length) return;
		const markdown = joinAttachmentMarkdown(paths);
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
</script>

<main class="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
	<FileDropZone class="relative z-10 flex min-h-0 flex-1 flex-col" onfiles={attachFiles}>
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
				onview={changeView}
				ontogglepin={() => onupdate(note.id, { pinned: !note.pinned })}
				ontoggledock={() => onupdate(note.id, { overlay: !note.overlay })}
				ontogglearchive={toggleArchive}
				onprint={() => onprint?.(note)}
				onexport={() => onexport?.(note)}
				oncopy={() => oncopy?.(note)}
				ondelete={() => ondelete(note.id)}
				onfullpreview={() => ontogglefullpreview?.()}
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
				/>
			{/if}

			{#if view !== 'preview'}
				<EditorFormatBar oncommand={runCommand} onguide={() => (guideOpen = true)} />
			{/if}

			<div class="relative grid min-h-0 flex-1 overflow-hidden">
				{#if view === 'write'}
					<Textarea
						bind:ref={textareaEl}
						value={draft}
						oninput={(event) => {
							commitBody((event.currentTarget as HTMLTextAreaElement).value);
							refreshSuggestions();
						}}
						onkeydown={onEditorKeydown}
						onkeyup={refreshFromKeyup}
						onclick={refreshSuggestions}
						onblur={() => (suggestions = null)}
						spellcheck={settings.spellcheck}
						variant="bare"
						size="lg"
						placeholder="Start writing. Use the toolbar or shortcuts to format..."
						class="scrollbar-none h-full w-full px-6 py-4 text-on-surface-variant"
					></Textarea>
				{:else if view === 'split'}
					<div class="grid min-h-0 grid-cols-2 divide-x divide-hairline">
						<Textarea
							bind:ref={textareaEl}
							value={draft}
							oninput={(event) => {
								commitBody((event.currentTarget as HTMLTextAreaElement).value);
								refreshSuggestions();
							}}
							onkeydown={onEditorKeydown}
							onkeyup={refreshFromKeyup}
							onclick={refreshSuggestions}
							onblur={() => (suggestions = null)}
							spellcheck={settings.spellcheck}
							variant="bare"
							size="md"
							placeholder="Write here..."
							class="scrollbar-none h-full w-full overflow-y-auto px-4 py-4 text-on-surface-variant"
							onscroll={onEditorScroll}
						></Textarea>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div
							bind:this={previewEl}
							class="scrollbar-none h-full overflow-y-auto px-5 py-4"
							onscroll={onPreviewScroll}
							onclick={togglePreviewCheckbox}
						>
							{#if html}
								<div class="markdown-body">{@html html}</div>
							{:else}
								<p class="text-body-sm font-body text-outline">Preview appears here.</p>
							{/if}
						</div>
					</div>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						bind:this={previewEl}
						class="scrollbar-none h-full overflow-y-auto px-6 py-4"
						onclick={togglePreviewCheckbox}
					>
						{#if html}
							<div class="markdown-body mx-auto max-w-2xl">{@html html}</div>
						{:else}
							<p class="text-body-lg font-body text-outline">
								This note is empty. Switch to Write to start composing.
							</p>
						{/if}
					</div>
				{/if}

				<WikiLinkPopover
					{open}
					target={textareaEl}
					items={suggestions?.items ?? []}
					index={activeIndex}
					onselect={choose}
					onhover={(position) => (activeIndex = position)}
				/>
			</div>
		{:else}
			<EmptyState
				size="lg"
				icon={PenLine}
				heading="No note selected"
				title="Create a new note or pick one from the list to begin."
			/>
		{/if}
			</div>
		{/snippet}
	</FileDropZone>

	<MarkdownGuideDialog bind:open={guideOpen} />
</main>
