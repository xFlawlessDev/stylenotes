<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import {
		Pin,
		Share2,
		Trash2,
		Tag,
		Bold,
		Italic,
		Code2,
		Link,
		List,
		ListChecks,
		Quote,
		FileText,
	} from '@lucide/svelte';
	import type { Note } from '$lib/content/content';

	let {
		note,
		ontitle,
		onpin,
		ondelete,
	}: {
		note?: Note;
		ontitle: (id: string, title: string) => void;
		onpin: (id: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	let aurora = $state('');
	let title = $state('');
	let html = $state('');

	$effect(() => {
		title = note?.title ?? '';
	});

	$effect(() => {
		const source = note?.body ?? '';
		if (!source) {
			html = '';
			return;
		}

		let cancelled = false;
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
			worker = new Worker(new URL('../../workers/drift.js', import.meta.url), {
				type: 'module',
			});
		} catch {
			return;
		}
		worker.onmessage = (event) => {
			aurora = event.data.aurora;
		};
		return () => worker.terminate();
	});

	const tools = [Bold, Italic, Code2, Link, List, ListChecks, Quote];
</script>

<main class="glass-panel relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
	{#if aurora}
		<div
			class="pointer-events-none absolute inset-0 opacity-60 blur-[3px] transition-[background] duration-1000"
			style="background-image: {aurora};"
		></div>
	{/if}

	<div class="relative z-10 flex min-h-0 flex-1 flex-col">
		{#if note}
			<div class="flex h-12 shrink-0 items-center justify-between px-4">
				<span class="flex items-center gap-1.5 text-label-md font-label text-on-surface-variant">
					<FileText size={15} class="text-primary" />
					<span class="capitalize">{note.folder}</span>
					<span class="text-outline">/</span>
					<span class="text-on-surface">{note.title || 'Untitled'}</span>
				</span>
				<div class="flex items-center gap-1">
					<button
						class="glass-chip flex size-8 items-center justify-center rounded-lg transition-all {note.pinned
							? 'text-primary'
							: 'text-on-surface-variant hover:text-on-surface'}"
						title="Pin note"
						onclick={() => onpin(note.id)}
					>
						<Pin size={16} />
					</button>
					<button
						class="glass-chip flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-on-surface"
						title="Share"
					>
						<Share2 size={16} />
					</button>
					<button
						class="glass-chip flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-error-container/40 hover:text-error"
						title="Delete note"
						onclick={() => ondelete(note.id)}
					>
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			<div class="flex shrink-0 flex-col gap-1 px-6 pt-1 pb-3">
				<input
					class="w-full bg-transparent text-headline-xl font-headline font-bold tracking-tight text-on-surface placeholder:text-outline/60 focus:outline-none"
					type="text"
					placeholder="Untitled note"
					bind:value={title}
					oninput={() => ontitle(note.id, title)}
				/>
				<div class="flex flex-wrap items-center gap-1.5 pt-1">
					{#each note.tags as tag}
						<span
							class="glass-chip flex items-center gap-1 rounded-full px-2.5 py-1 text-code-sm font-code text-secondary"
						>
							<Tag size={11} />
							{tag}
						</span>
					{/each}
					<span class="text-code-sm font-code text-outline">{note.updated}</span>
				</div>
			</div>

			<div class="glass-well mx-6 flex shrink-0 items-center gap-0.5 rounded-xl px-1.5 py-1 text-on-surface-variant">
				{#each tools as Icon}
					<button
						class="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
					>
						<Icon size={16} />
					</button>
				{/each}
			</div>

			<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-4">
				{#if html}
					<div class="markdown-body">{@html html}</div>
				{:else}
					<p class="text-body-lg font-body text-outline">
						This note is empty. Start typing to bring it to life.
					</p>
				{/if}
			</div>

			<footer
				class="glass-well m-2.5 mt-0 flex h-8 shrink-0 items-center justify-between rounded-xl px-4 text-code-sm font-code text-outline"
			>
				<div class="flex items-center gap-3">
					<span>Words <strong class="font-normal text-on-surface">{note.words}</strong></span>
					<span>Chars <strong class="font-normal text-on-surface">{note.chars}</strong></span>
				</div>
				<div class="flex items-center gap-3">
					<span class="flex items-center gap-1.5">
						<span class="size-1.5 rounded-full bg-emerald-400"></span>
						Saved locally
					</span>
					<span>{note.updated}</span>
				</div>
			</footer>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<div class="glass-well flex size-14 items-center justify-center rounded-2xl text-outline">
					<FileText size={26} />
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
</main>