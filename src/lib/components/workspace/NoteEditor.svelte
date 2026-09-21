<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import {
		Pin,
		Share2,
		Trash2,
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
		Columns2,
		Eye,
		Check,
	} from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { settings, updateSettings, type EditorView } from '$lib/stores/settings.svelte';
	import type { Folder } from '$lib/stores/notes';
	import AddTagDialog from '$lib/components/dialogs/AddTagDialog.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type Patch = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder' | 'pinned'>>;

	let {
		note,
		folders,
		onupdate,
		ondelete,
		onshare,
	}: {
		note?: Note;
		folders: Folder[];
		onupdate: (id: string, patch: Patch) => void;
		ondelete: (id: string) => void;
		onshare?: (note: Note) => void;
	} = $props();

	let aurora = $state('');
	let title = $state('');
	let draft = $state('');
	let html = $state('');
	let textareaEl = $state<HTMLTextAreaElement>();
	let tagDialogOpen = $state(false);

	const view = $derived(settings.editorView);
	const folderOptions = $derived(folders.filter((folder) => folder.id !== 'all'));

	$effect(() => {
		title = note?.title ?? '';
		draft = note?.body ?? '';
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

	onMount(() => {
		if (typeof Worker === 'undefined') return;
		let worker: Worker;
		try {
			worker = new Worker(new URL('../../workers/drift.js', import.meta.url), { type: 'module' });
		} catch {
			return;
		}

		const root = document.documentElement;
		const send = () =>
			worker.postMessage({
				palette: {
					a: 'var(--aurora-1)',
					b: 'var(--aurora-2)',
					c: 'var(--aurora-3)',
				},
				light: root.classList.contains('light'),
			});

		worker.onmessage = (event) => {
			aurora = event.data.aurora;
		};
		send();

		return () => worker.terminate();
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
		{ icon: Bold, run: () => wrapSelection('**') },
		{ icon: Italic, run: () => wrapSelection('*') },
		{ icon: Strikethrough, run: () => wrapSelection('~~') },
		{ icon: Code2, run: () => wrapSelection('`') },
		{ icon: Link, run: () => wrapSelection('[', '](https://)', 'title') },
	];
	const blockTools = [
		{ icon: Heading2, run: () => prefixLines('## ') },
		{ icon: List, run: () => prefixLines('- ') },
		{ icon: ListChecks, run: () => prefixLines('- [ ] ') },
		{ icon: Quote, run: () => prefixLines('> ') },
		{ icon: Minus, run: () => commitBody(`${draft}\n\n---\n`) },
	];

	const views: { id: EditorView; icon: typeof Eye; title: string }[] = [
		{ id: 'write', icon: PenLine, title: 'Write' },
		{ id: 'split', icon: Columns2, title: 'Split' },
		{ id: 'preview', icon: Eye, title: 'Preview' },
	];

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
</script>

<main class="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
	{#if aurora && !settings.reduceMotion}
		<div
			class="pointer-events-none absolute inset-0 opacity-60 blur-[3px]"
			style="background-image: {aurora};"
		></div>
	{/if}

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
				<div class="flex h-12 shrink-0 items-center justify-between px-4">
					<label class="flex items-center gap-1.5 text-label-md font-label text-on-surface-variant">
						<select
							class="cursor-pointer appearance-none bg-transparent capitalize text-primary focus:outline-none"
							value={note.folder}
							onchange={(event) =>
								onupdate(note.id, { folder: (event.currentTarget as HTMLSelectElement).value })}
						>
							{#each folderOptions as folder (folder.id)}
								<option class="bg-surface-container text-on-surface" value={folder.id}>
									{folder.label}
								</option>
							{/each}
						</select>
						<span class="text-outline">/</span>
						<span class="truncate text-on-surface">{note.title || 'Untitled'}</span>
					</label>

					<div class="flex items-center gap-1">
						<div class="glass-well mr-1 hidden items-center rounded-lg p-0.5 sm:flex">
							{#each views as item (item.id)}
								{@const Icon = item.icon}
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												class="flex size-7 items-center justify-center rounded-md transition-colors {view ===
												item.id
													? 'bg-surface-container-high/80 text-primary'
													: 'text-outline hover:text-on-surface'}"
												aria-label={item.title}
												onclick={() => updateSettings({ editorView: item.id })}
											>
												<Icon size={15} />
											</button>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content>{item.title}</Tooltip.Content>
								</Tooltip.Root>
							{/each}
						</div>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="glass-chip flex size-8 items-center justify-center rounded-lg transition-all {note.pinned
											? 'text-primary'
											: 'text-on-surface-variant hover:text-on-surface'}"
										aria-label="Pin note"
										onclick={() => onupdate(note.id, { pinned: !note.pinned })}
									>
										<Pin size={16} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>{note.pinned ? 'Unpin note' : 'Pin note'}</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="glass-chip flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-on-surface"
										aria-label="Share note"
										onclick={() => onshare?.(note)}
									>
										<Share2 size={16} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>Share note</Tooltip.Content>
						</Tooltip.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										class="glass-chip flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-error-container/40 hover:text-error"
										aria-label="Delete note"
										onclick={() => ondelete(note.id)}
									>
										<Trash2 size={16} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>Delete note</Tooltip.Content>
						</Tooltip.Root>
					</div>
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
						<button
							class="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
							onclick={tool.run}
						>
							<tool.icon size={16} />
						</button>
					{/each}
					<span class="mx-1 h-4 w-px shrink-0 bg-outline-variant/40"></span>
					{#each blockTools as tool}
						<button
							class="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
							onclick={tool.run}
						>
							<tool.icon size={16} />
						</button>
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
						<div class="scrollbar-none h-full overflow-y-auto px-5 py-4">
							{#if html}
								<div class="markdown-body">{@html html}</div>
							{:else}
								<p class="text-body-sm font-body text-outline">Preview appears here.</p>
							{/if}
						</div>
					</div>
				{:else}
					<div class="scrollbar-none h-full overflow-y-auto px-6 py-4">
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