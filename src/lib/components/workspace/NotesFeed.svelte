<script lang="ts">
	import { Search, Pin, FileText, X, Tag } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		notes,
		selectedId,
		total,
		folderLabel = 'All Notes',
		activeTag = null,
		resetToken = 0,
		showFolder = false,
		folderLabels = {},
		onselect,
		onpin,
		onselecttag,
		oncleartag,
		onselectfolder,
	}: {
		notes: Note[];
		selectedId: string;
		total: number;
		folderLabel?: string;
		activeTag?: string | null;
		resetToken?: number;
		showFolder?: boolean;
		folderLabels?: Record<string, string>;
		onselect: (id: string) => void;
		onpin: (id: string) => void;
		onselecttag?: (tag: string) => void;
		oncleartag?: () => void;
		onselectfolder?: (id: string) => void;
	} = $props();

	let query = $state('');
	let tab = $state<'all' | 'pinned'>('all');

	$effect(() => {
		void resetToken;
		query = '';
		tab = 'all';
	});

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
		<Breadcrumb.Root class="px-1 pt-1">
			<Breadcrumb.List class="text-label-sm font-label text-outline uppercase">
				<Breadcrumb.Item>
					<button
						type="button"
						class="transition-colors hover:text-on-surface"
						onclick={() => onselectfolder?.('all')}
					>
						{folderLabel}
					</button>
				</Breadcrumb.Item>
				{#if activeTag}
					<Breadcrumb.Separator class="text-outline/60 [&>svg]:size-3" />
					<Breadcrumb.Item>
						<Breadcrumb.Page class="flex items-center gap-1 normal-case text-primary">
							<Tag size={11} />
							{activeTag}
						</Breadcrumb.Page>
					</Breadcrumb.Item>
				{/if}
			</Breadcrumb.List>
		</Breadcrumb.Root>

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

		{#if activeTag}
			<div
				class="emphasis-container flex items-center justify-between rounded-2xl px-3 py-2 ring-1 ring-inset ring-emphasis-container-ring"
			>
				<span class="flex items-center gap-1.5 text-code-sm font-code text-on-primary-container">
					<Tag size={12} />
					Filtering by #{activeTag}
				</span>
				<button
					class="flex size-5 items-center justify-center rounded-md text-on-primary-container transition-colors hover:bg-on-primary-container/15"
					aria-label="Clear tag filter"
					onclick={() => (oncleartag ? oncleartag() : onselecttag?.(activeTag))}
				>
					<X size={13} />
				</button>
			</div>
		{/if}
	</div>

	<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
		{#each filtered as note (note.id)}
			<div
				class="group relative w-full cursor-pointer rounded-2xl p-3 text-left transition-all {selectedId === note.id
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
						class="emphasis-primary absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full"
					></span>
				{/if}
				{#if showFolder}
					<Breadcrumb.Root class="mb-1">
						<Breadcrumb.List class="gap-1 text-code-sm font-code text-outline">
							<Breadcrumb.Item>
								<button
									type="button"
									class="transition-colors group-hover:text-primary"
									onclick={(event) => {
										event.stopPropagation();
										onselectfolder?.(note.folder);
									}}
								>
									{folderLabels[note.folder] ?? note.folder}
								</button>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>
				{/if}
				<div class="mb-1 flex items-start justify-between gap-2">
					<h2
						class="line-clamp-1 text-headline-sm font-headline font-semibold text-on-surface transition-colors group-hover:text-primary"
					>
						{note.title || 'Untitled note'}
					</h2>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
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
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{note.pinned ? 'Unpin note' : 'Pin note'}</Tooltip.Content>
					</Tooltip.Root>
				</div>
				<p class="mb-2.5 line-clamp-2 text-body-sm font-body leading-relaxed text-outline">
					{note.excerpt}
				</p>
				<div class="flex items-center justify-between gap-2">
					<span class="text-code-sm font-code text-outline">{note.updated}</span>
					<div class="flex min-w-0 gap-1">
						{#each note.tags.slice(0, 2) as tag (tag)}
							<button
								class="truncate rounded-md px-1.5 py-px text-code-sm font-code transition-colors {activeTag ===
								tag
									? 'emphasis-container text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring'
									: 'bg-surface-container-high/60 text-tertiary hover:text-on-surface'}"
								onclick={(event) => {
									event.stopPropagation();
									onselecttag?.(tag);
								}}
							>
								#{tag}
							</button>
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
</section>