<script lang="ts">
	import { Search, Pin, FileText, Plus } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';

	let {
		notes,
		selectedId,
		total,
		onselect,
		onpin,
		oncreate,
	}: {
		notes: Note[];
		selectedId: string;
		total: number;
		onselect: (id: string) => void;
		onpin: (id: string) => void;
		oncreate: () => void;
	} = $props();

	let query = $state('');
	let tab = $state<'all' | 'pinned'>('all');

	const filtered = $derived(
		notes.filter((note) => {
			if (tab === 'pinned' && !note.pinned) return false;
			if (!query.trim()) return true;
			const text = `${note.title} ${note.tags.join(' ')} ${note.excerpt}`.toLowerCase();
			return text.includes(query.trim().toLowerCase());
		})
	);
</script>

<section class="glass-panel flex w-[300px] shrink-0 flex-col gap-2.5 overflow-hidden rounded-2xl p-2.5">
	<div class="flex flex-col gap-2">
		<div class="relative w-full">
			<Search size={16} class="pointer-events-none absolute top-2.5 left-3 text-outline" />
			<input
				bind:value={query}
				class="glass-well h-9 w-full rounded-xl pr-3 pl-9 text-body-sm font-body text-on-surface placeholder:text-outline focus:border-primary/50 focus:outline-none"
				placeholder="Search notes and tags"
				type="text"
			/>
		</div>

		<div class="glass-well flex items-center rounded-xl p-0.5">
			{#each [{ k: 'all' as const, l: `All (${total})` }, { k: 'pinned' as const, l: 'Pinned' }] as t}
				<button
					class="flex-1 rounded-lg py-1.5 text-center text-label-md font-label transition-all {tab ===
					t.k
						? 'glass-chip font-medium text-on-surface'
						: 'text-outline hover:text-on-surface'}"
					onclick={() => (tab = t.k)}
				>
					{t.l}
				</button>
			{/each}
		</div>
	</div>

	<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
		{#each filtered as note (note.id)}
			<div
				class="group relative w-full cursor-pointer rounded-xl p-3 text-left transition-all {selectedId === note.id
					? 'glass-chip'
					: 'bg-surface-container-lowest/30 hover:bg-surface-container/50'}"
				role="button"
				tabindex="0"
				onclick={() => onselect(note.id)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onselect(note.id);
					}
				}}
			>
				{#if selectedId === note.id}
					<span
						class="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-primary"
					></span>
				{/if}
				<div class="mb-1 flex items-start justify-between gap-2">
					<h2
						class="line-clamp-1 text-headline-sm font-headline font-semibold text-on-surface transition-colors group-hover:text-primary"
					>
						{note.title || 'Untitled note'}
					</h2>
					<button
						class="shrink-0 rounded-md p-0.5 transition-all {note.pinned
							? 'text-primary'
							: 'text-outline opacity-0 group-hover:opacity-100'}"
						aria-label="Toggle pin"
						onclick={(event) => {
							event.stopPropagation();
							onpin(note.id);
						}}
					>
						<Pin size={15} />
					</button>
				</div>
				<p class="mb-2.5 line-clamp-2 text-body-sm font-body leading-relaxed text-outline">
					{note.excerpt}
				</p>
				<div class="flex items-center justify-between gap-2">
					<span class="text-code-sm font-code text-outline">{note.updated}</span>
					<div class="flex min-w-0 gap-1">
						{#each note.tags.slice(0, 2) as tag}
							<span
								class="truncate rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code text-tertiary"
							>
								#{tag}
							</span>
						{/each}
					</div>
				</div>
			</div>
		{/each}

		{#if filtered.length === 0}
			<div class="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
				<div
					class="glass-well flex size-11 items-center justify-center rounded-2xl text-outline"
				>
					<FileText size={20} />
				</div>
				<p class="text-body-sm font-body text-outline">
					{query ? 'No notes match that search.' : 'Nothing here yet.'}
				</p>
			</div>
		{/if}
	</div>

	<button
		class="glass-well flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-label-md font-label text-on-surface-variant transition-colors hover:text-on-surface"
		onclick={oncreate}
	>
		<Plus size={15} />
		New Note
	</button>
</section>