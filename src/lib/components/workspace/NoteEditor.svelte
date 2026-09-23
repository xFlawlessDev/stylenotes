<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { Minimize2, PenLine, Tag, X } from '@lucide/svelte';
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
	import { handlePreviewAction } from '$lib/content/preview-actions';
	import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
	import { openNoteWindow } from '$lib/windows';
	import { Button, EmptyState, Input, Select, Textarea } from '$lib/components/base';
	import AddTagDialog from '$lib/components/dialogs/AddTagDialog.svelte';
	import MarkdownGuideDialog from '$lib/components/dialogs/MarkdownGuideDialog.svelte';
	import NoteToolbar from '$lib/components/workspace/NoteToolbar.svelte';
	import EditorStatus from '$lib/components/workspace/EditorStatus.svelte';
	import EditorFormatBar from '$lib/components/workspace/EditorFormatBar.svelte';
	import FileDropZone from '$lib/components/workspace/FileDropZone.svelte';

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
	} = $props();

	let title = $state('');
	let draft = $state('');
	let html = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let previewEl = $state<HTMLDivElement>();
	let tagDialogOpen = $state(false);
	let guideOpen = $state(false);
	let moveFolder = $state('');
	let viewOverride = $state<{ id: string; view: EditorView } | null>(null);

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

		void renderNoteHtml(source).then(renderNotePreviewHtml)
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

	function onEditorKeydown(event: KeyboardEvent) {
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

	function addTag() {
		if (!note) return;
		tagDialogOpen = true;
	}

	function commitTag(tag: string) {
		if (!note) return;
		onupdate(note.id, { tags: [...note.tags, tag] });
	}

	function removeTag(tag: string) {
		if (!note) return;
		onupdate(note.id, { tags: note.tags.filter((item) => item !== tag) });
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
			{#if fullPreview}
				<div class="flex h-11 shrink-0 items-center justify-between px-4">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase"
						>Full preview</span
					>
					<Button
						variant="secondary"
						size="xs"
						shape="pill"
						class="gap-1.5"
						onclick={() => ontogglefullpreview?.()}
					>
						<Minimize2 size={13} /> Exit
					</Button>
				</div>
			{:else if settings.focusMode}
				<div class="flex h-11 shrink-0 items-center justify-between px-4">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase"
						>Focus mode</span
					>
					<Button
						variant="secondary"
						size="xs"
						shape="pill"
						class="gap-1.5"
						onclick={() => updateSettings({ focusMode: false })}
					>
						<X size={13} /> Exit
					</Button>
				</div>
			{:else}
				<div class="flex h-10 shrink-0 items-center justify-end px-4">
					<NoteToolbar
						{view}
						pinned={note.pinned}
						docked={note.overlay}
						{archived}
						onview={changeView}
						ontogglepin={() => onupdate(note.id, { pinned: !note.pinned })}
						ontoggledock={() => onupdate(note.id, { overlay: !note.overlay })}
						ontogglearchive={toggleArchive}
						onopenwindow={() => void openNoteWindow(note.id)}
						onprint={() => onprint?.(note)}
						onexport={() => onexport?.(note)}
						oncopy={() => oncopy?.(note)}
						ondelete={() => ondelete(note.id)}
						onfullpreview={() => ontogglefullpreview?.()}
					/>
				</div>
			{/if}

			{#if !fullPreview}
				<div class="@container flex shrink-0 flex-col gap-2 px-6 pt-1 pb-3">
					<div class="flex flex-wrap items-center gap-2">
						<Button
							bare
							class="w-fit max-w-full truncate text-label-sm tracking-wide text-primary capitalize hover:brightness-110"
							onclick={() => onselectfolder?.(note.folder)}
						>
							{folderLabel}
						</Button>
						{#if folderOptions.length}
							<Select
								bind:value={moveFolder}
								placeholder="Move to…"
								label="Move note to folder"
								size="sm"
								variant="chip"
								class="max-w-full"
								options={folderOptions}
								onchange={moveToFolder}
							/>
						{/if}
					</div>
					<Input
						variant="bare"
						size="none"
						class="w-full font-headline text-headline-xl font-bold tracking-tight placeholder:text-outline/60"
						placeholder="Untitled note"
						bind:value={title}
						oninput={() => onupdate(note.id, { title })}
					/>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each note.tags as tag (tag)}
							<span
								class="glass-chip group flex items-center gap-1 rounded-full px-2.5 py-1 text-code-sm font-code text-secondary"
							>
								<Tag size={11} />
								{tag}
								<Button
									bare
									class="ml-0.5 opacity-0 group-hover:opacity-100"
									aria-label="Remove tag"
									onclick={() => removeTag(tag)}
								>
									<X size={10} />
								</Button>
							</span>
						{/each}
						<Button
							size="xs"
							shape="pill"
							class="glass-well gap-1 px-2 font-code text-code-sm text-outline hover:bg-transparent"
							onclick={addTag}
						>
							+ Tag
						</Button>
						<span class="text-code-sm font-code text-outline">{note.updated}</span>
						<span class="ml-auto">
							<EditorStatus {note} />
						</span>
					</div>
				</div>
			{/if}

			{#if view !== 'preview'}
				<EditorFormatBar oncommand={runCommand} onguide={() => (guideOpen = true)} />
			{/if}

			<div class="grid min-h-0 flex-1 overflow-hidden">
				{#if view === 'write'}
					<Textarea
						bind:ref={textareaEl}
						value={draft}
						oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
						onkeydown={onEditorKeydown}
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
							oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
							onkeydown={onEditorKeydown}
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

	<AddTagDialog bind:open={tagDialogOpen} existing={note?.tags ?? []} onsubmit={commitTag} />
	<MarkdownGuideDialog bind:open={guideOpen} />
</main>
