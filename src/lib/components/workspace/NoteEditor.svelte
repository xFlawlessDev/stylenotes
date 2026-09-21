<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { marked } from 'marked';
	import {
		Tag,
		X,
		Bold,
		Italic,
		Strikethrough,
		Code2,
		Link,
		Heading2,
		List,
		ListChecks,
		Quote,
		Minus,
		PenLine,
		Check,
	} from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { settings, updateSettings, type EditorView } from '$lib/stores/settings.svelte';
	import type { Folder } from '$lib/stores/notes';
	import { toggleChecklistItem } from '$lib/stores/notes';
	import AddTagDialog from '$lib/components/dialogs/AddTagDialog.svelte';
	import NoteToolbar from '$lib/components/workspace/NoteToolbar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type Patch = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder' | 'pinned'>>;

	const ARCHIVE_FOLDER = 'archive';
	const RESTORE_FOLDER = 'personal';

	let {
		note,
		folders,
		focusToken = 0,
		onupdate,
		ondelete,
		onshare,
		onselectfolder,
	}: {
		note?: Note;
		folders: Folder[];
		focusToken?: number;
		onupdate: (id: string, patch: Patch) => void;
		ondelete: (id: string) => void;
		onshare?: (note: Note) => void;
		onselectfolder?: (id: string) => void;
	} = $props();

	let title = $state('');
	let draft = $state('');
	let html = $state('');
	let textareaEl = $state<HTMLTextAreaElement>();
	let previewEl = $state<HTMLDivElement>();
	let tagDialogOpen = $state(false);
	let viewOverride = $state<{ id: string; view: EditorView } | null>(null);

	const view = $derived(
		viewOverride && viewOverride.id === note?.id ? viewOverride.view : settings.editorView
	);
	const folderLabel = $derived(
		folders.find((folder) => folder.id === note?.folder)?.label ?? note?.folder ?? ''
	);

	$effect(() => {
		title = note?.title ?? '';
		draft = note?.body ?? '';
	});

	$effect(() => {
		const token = focusToken;
		if (!token) return;
		untrack(() => {
			if (!note) return;
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

		const render = async () => {
			try {
				const rendered = await marked.parse(source);
				let clean = rendered;
				try {
					const { default: DOMPurify } = await import('dompurify');
					clean = DOMPurify.sanitize(rendered);
				} catch {
					clean = rendered;
				}
				if (!cancelled) html = clean;
			} catch {
				if (!cancelled) html = '';
			}
		};
		void render();

		return () => {
			cancelled = true;
		};
	});

	function commitBody(value: string) {
		if (!note) return;
		draft = value;
		onupdate(note.id, { body: value });
	}

	function wrapSelection(before: string, after = before, placeholder = 'text') {
		if (!note || !textareaEl) return;
		const el = textareaEl;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const selected = draft.slice(start, end) || placeholder;
		const next = `${draft.slice(0, start)}${before}${selected}${after}${draft.slice(end)}`;
		commitBody(next);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + before.length, start + before.length + selected.length);
		});
	}

	function prefixLines(prefix: string, numbered = false) {
		if (!note || !textareaEl) return;
		const el = textareaEl;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const lineStart = draft.lastIndexOf('\n', start - 1) + 1;
		const lineEnd = draft.indexOf('\n', end);
		const stop = lineEnd === -1 ? draft.length : lineEnd;
		const block = draft.slice(lineStart, stop);
		const lines = block.split('\n');
		const next = lines
			.map((line, i) => `${numbered ? `${i + 1}. ` : prefix}${line.replace(/^(\s*([-*+]|\d+\.)\s+)/, '')}`)
			.join('\n');
		const result = `${draft.slice(0, lineStart)}${next}${draft.slice(stop)}`;
		commitBody(result);
		requestAnimationFrame(() => el.focus());
	}

	const inlineTools = [
		{ icon: Bold, title: 'Bold', run: () => wrapSelection('**') },
		{ icon: Italic, title: 'Italic', run: () => wrapSelection('*') },
		{ icon: Strikethrough, title: 'Strikethrough', run: () => wrapSelection('~~') },
		{ icon: Code2, title: 'Inline code', run: () => wrapSelection('`') },
		{ icon: Link, title: 'Link', run: () => wrapSelection('[', '](https://)', 'title') },
	];
	const blockTools = [
		{ icon: Heading2, title: 'Heading', run: () => prefixLines('## ') },
		{ icon: List, title: 'Bullet list', run: () => prefixLines('- ') },
		{ icon: ListChecks, title: 'Checklist', run: () => prefixLines('- [ ] ') },
		{ icon: Quote, title: 'Quote', run: () => prefixLines('> ') },
		{ icon: Minus, title: 'Divider', run: () => commitBody(`${draft}\n\n---\n`) },
	];

	function changeView(next: EditorView) {
		viewOverride = null;
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

	function togglePreviewCheckbox(event: MouseEvent) {
		if (!note || !previewEl) return;
		const target = event.target as HTMLElement;
		const input = target.closest('input[type="checkbox"]') as HTMLInputElement | null;
		if (!input || !previewEl.contains(input)) return;
		event.preventDefault();
		const boxes = Array.from(previewEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
		const index = boxes.indexOf(input);
		if (index < 0) return;
		commitBody(toggleChecklistItem(draft, index));
	}
</script>

<main class="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
	<div class="relative z-10 flex min-h-0 flex-1 flex-col">
		{#if note}
			{#if settings.focusMode}
				<div class="flex h-11 shrink-0 items-center justify-between px-4">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase"
						>Focus mode</span
					>
					<button
						class="glass-chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm font-label text-on-surface-variant transition-colors hover:text-on-surface"
						onclick={() => updateSettings({ focusMode: false })}
					>
						<X size={13} /> Exit
					</button>
				</div>
			{:else}
				<div class="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
					<Breadcrumb.Root class="min-w-0">
						<Breadcrumb.List
							class="gap-1.5 text-label-md font-label text-on-surface-variant sm:gap-1.5"
						>
							<Breadcrumb.Item>
								<button
									type="button"
									class="text-primary capitalize transition-colors hover:brightness-110"
									onclick={() => onselectfolder?.(note.folder)}
								>
									{folderLabel}
								</button>
							</Breadcrumb.Item>
							<Breadcrumb.Separator class="text-outline [&>svg]:size-3.5" />
							<Breadcrumb.Item>
								<Breadcrumb.Page class="truncate text-on-surface">
									{note.title || 'Untitled'}
								</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>

					<NoteToolbar
						{view}
						pinned={note.pinned}
						{archived}
						onview={changeView}
						ontogglepin={() => onupdate(note.id, { pinned: !note.pinned })}
						ontogglearchive={toggleArchive}
						onshare={() => onshare?.(note)}
						ondelete={() => ondelete(note.id)}
					/>
				</div>
			{/if}

			<div class="flex shrink-0 flex-col gap-1 px-6 pt-1 pb-3">
				<input
					class="w-full bg-transparent text-headline-xl font-headline font-bold tracking-tight text-on-surface placeholder:text-outline/60 focus:outline-none"
					type="text"
					placeholder="Untitled note"
					bind:value={title}
					oninput={() => onupdate(note.id, { title })}
				/>
				<div class="flex flex-wrap items-center gap-1.5 pt-1">
					{#each note.tags as tag (tag)}
						<span
							class="glass-chip group flex items-center gap-1 rounded-full px-2.5 py-1 text-code-sm font-code text-secondary"
						>
							<Tag size={11} />
							{tag}
							<button
								class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
								aria-label="Remove tag"
								onclick={() => removeTag(tag)}
							>
								<X size={10} />
							</button>
						</span>
					{/each}
					<button
						class="glass-well flex items-center gap-1 rounded-full px-2 py-1 text-code-sm font-code text-outline transition-colors hover:text-on-surface"
						onclick={addTag}
					>
						+ Tag
					</button>
					<span class="ml-1 text-code-sm font-code text-outline">{note.updated}</span>
				</div>
			</div>

			{#if view !== 'preview'}
				<div
					class="glass-well mx-6 flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl px-1.5 py-1 text-on-surface-variant scrollbar-none"
				>
					{#each inlineTools as tool}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
										aria-label={tool.title}
										onclick={tool.run}
									>
										<tool.icon size={16} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>{tool.title}</Tooltip.Content>
						</Tooltip.Root>
					{/each}
					<span class="mx-1 h-4 w-px shrink-0 bg-outline-variant/40"></span>
					{#each blockTools as tool}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
										aria-label={tool.title}
										onclick={tool.run}
									>
										<tool.icon size={16} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>{tool.title}</Tooltip.Content>
						</Tooltip.Root>
					{/each}
				</div>
			{/if}

			<div class="grid min-h-0 flex-1 overflow-hidden">
				{#if view === 'write'}
					<textarea
						bind:this={textareaEl}
						value={draft}
						oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
						spellcheck={settings.spellcheck}
						placeholder="Start writing in Markdown..."
						class="scrollbar-none h-full w-full resize-none bg-transparent px-6 py-4 text-body-lg font-body leading-relaxed text-on-surface-variant placeholder:text-outline focus:outline-none"
					></textarea>
				{:else if view === 'split'}
					<div class="grid min-h-0 grid-cols-2 divide-x divide-white/5">
						<textarea
							bind:this={textareaEl}
							value={draft}
							oninput={(event) => commitBody((event.currentTarget as HTMLTextAreaElement).value)}
							spellcheck={settings.spellcheck}
							placeholder="Write in Markdown..."
							class="scrollbar-none h-full w-full resize-none bg-transparent px-4 py-4 text-body-md font-body leading-relaxed text-on-surface-variant placeholder:text-outline focus:outline-none"
						></textarea>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div
							class="scrollbar-none h-full overflow-y-auto px-5 py-4"
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

			<footer
				class="glass-well m-2.5 mt-0 flex h-8 shrink-0 items-center justify-between rounded-xl px-4 text-code-sm font-code text-outline"
			>
				<div class="flex items-center gap-3">
					{#if settings.showWordCount}
						<span>Words <strong class="font-normal text-on-surface">{note.words}</strong></span>
						<span>Chars <strong class="font-normal text-on-surface">{note.chars}</strong></span>
					{:else}
						<span class="capitalize">{view} mode</span>
					{/if}
				</div>
				<div class="flex items-center gap-3">
					<span class="flex items-center gap-1.5">
						<Check size={12} class="text-emerald-400" />
						Saved locally
					</span>
					<span>{note.updated}</span>
				</div>
			</footer>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<div class="glass-well flex size-14 items-center justify-center rounded-2xl text-outline">
					<PenLine size={26} />
				</div>
				<div class="flex flex-col gap-1">
					<h2 class="text-headline-md font-headline text-on-surface">No note selected</h2>
					<p class="text-body-sm font-body text-outline">
						Create a new note or pick one from the list to begin.
					</p>
				</div>
			</div>
		{/if}
	</div>

	<AddTagDialog bind:open={tagDialogOpen} existing={note?.tags ?? []} onsubmit={commitTag} />
</main>