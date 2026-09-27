<script lang="ts">
	import { Pin, FileText, X, Tag } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { Button, EmptyState, SearchInput, SegmentedControl } from '$lib/components/base';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import NoteContextMenu from '$lib/components/workspace/NoteContextMenu.svelte';

	let {
		notes,
		selectedId,
		total,
		folderLabel = 'All Notes',
		activeTag = null,
		resetToken = 0,
		showFolder = false,
		folderLabels = {},
		open = false,
		onclose,
		onselect,
		onpin,
		onselecttag,
		oncleartag,
		onselectfolder,
		onopenwindow,
		ontoggledock,
		ontogglearchive,
		onprint,
		onexport,
		oncopy,
		ondelete,
	}: {
		notes: Note[];
		selectedId: string;
		total: number;
		folderLabel?: string;
		activeTag?: string | null;
		resetToken?: number;
		showFolder?: boolean;
		folderLabels?: Record<string, string>;
		open?: boolean;
		onclose?: () => void;
		onselect: (id: string) => void;
		onpin: (id: string) => void;
		onselecttag?: (tag: string) => void;
		oncleartag?: () => void;
		onselectfolder?: (id: string) => void;
		onopenwindow?: (id: string) => void;
		ontoggledock?: (id: string) => void;
		ontogglearchive?: (id: string) => void;
		onprint?: (id: string) => void;
		onexport?: (id: string) => void;
		oncopy?: (id: string) => void;
		ondelete?: (id: string) => void;
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

	/**
	 * Quick-access menu parity with `NoteToolbar`: the same note actions, reached
	 * by right-clicking a row. Notes without a slot wired (e.g. another caller of
	 * this feed) simply omit that item.
	 */
	const quickMenu = $derived(
		onopenwindow && ontoggledock && ontogglearchive && onprint && onexport && oncopy && ondelete
	);
</script>

<section
	class="glass-panel flex w-[300px] shrink-0 flex-col gap-2.5 overflow-hidden rounded-2xl p-2.5 max-lg:w-[256px] max-md:fixed max-md:inset-y-2.5 max-md:left-2.5 max-md:z-40 max-md:max-h-[calc(100vh-1.25rem)] max-md:shadow-2xl max-md:transition-transform {open
		? 'max-md:translate-x-0'
		: 'max-md:-translate-x-[120%]'}"
>
	<div class="relative flex flex-col gap-2">
		<Breadcrumb.Root class="px-1 pt-1">
			<Breadcrumb.List class="text-label-sm font-label text-outline uppercase">
				<Breadcrumb.Item>
					<Button
						bare
						class="transition-colors hover:text-on-surface"
						onclick={() => onselectfolder?.('all')}
					>
						{folderLabel}
					</Button>
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
		<Button
			size="icon-sm"
			class="absolute top-2.5 right-2.5 text-outline md:hidden"
			aria-label="Close notes list"
			onclick={onclose}
		>
			<X size={15} />
		</Button>

		<SearchInput
			bind:value={query}
			placeholder="Search notes and tags"
			ariaLabel="Search notes and tags"
		/>

		<SegmentedControl
			value={tab}
			items={[
				{ id: 'all', label: `All (${total})` },
				{ id: 'pinned', label: 'Pinned' }
			]}
			size="sm"
			ariaLabel="Note filters"
			itemClass="text-label-md"
			onchange={(id) => (tab = id as 'all' | 'pinned')}
		/>

		{#if activeTag}
			<div
				class="emphasis-container flex items-center justify-between rounded-2xl px-3 py-2 ring-1 ring-inset ring-emphasis-container-ring"
			>
				<span class="flex items-center gap-1.5 text-code-sm font-code text-on-primary-container">
					<Tag size={12} />
					Filtering by #{activeTag}
				</span>
				<Button
					size="icon-xs"
					class="text-on-primary-container hover:bg-on-primary-container/15"
					aria-label="Clear tag filter"
					onclick={() => (oncleartag ? oncleartag() : onselecttag?.(activeTag))}
				>
					<X size={13} />
				</Button>
			</div>
		{/if}
	</div>

	<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
		{#each filtered as note (note.id)}
			{#snippet card()}
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
									<Button
										bare
										class="font-code transition-colors group-hover:text-primary"
										onclick={(event) => {
											event.stopPropagation();
											onselectfolder?.(note.folder);
										}}
									>
										{folderLabels[note.folder] ?? note.folder}
									</Button>
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
									<Button
										{...props}
										bare
										class="shrink-0 p-0.5 transition-all {note.pinned
											? 'text-primary'
											: 'text-outline opacity-0 group-hover:opacity-100'}"
										aria-label="Toggle pin"
										onclick={(event) => {
											event.stopPropagation();
											onpin(note.id);
										}}
									>
										<Pin size={15} />
									</Button>
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
								<Button
									variant="secondary"
									size="xs"
									class="truncate px-1.5 font-code text-code-sm {activeTag === tag
										? 'text-on-surface ring-1 ring-inset ring-primary/60'
										: 'bg-surface-container-high/60 text-tertiary hover:text-on-surface'}"
									onclick={(event) => {
										event.stopPropagation();
										onselecttag?.(tag);
									}}
								>
									#{tag}
								</Button>
							{/each}
						</div>
					</div>
				</div>
			{/snippet}

			{#if quickMenu}
				<NoteContextMenu
					noteId={note.id}
					title={note.title}
					pinned={note.pinned}
					docked={note.overlay}
					archived={note.folder === 'archive'}
					{onselect}
					ontogglepin={() => onpin(note.id)}
					ontoggledock={(id) => ontoggledock?.(id)}
					ontogglearchive={(id) => ontogglearchive?.(id)}
					onopenwindow={(id) => onopenwindow?.(id)}
					onprint={(id) => onprint?.(id)}
					onexport={(id) => onexport?.(id)}
					oncopy={(id) => oncopy?.(id)}
					ondelete={(id) => ondelete?.(id)}
				>
					{@render card()}
				</NoteContextMenu>
			{:else}
				{@render card()}
			{/if}
		{/each}

		{#if filtered.length === 0}
			<EmptyState
				icon={FileText}
				title={query ? 'No notes match that search.' : 'Nothing here yet.'}
			/>
		{/if}
	</div>
</section>