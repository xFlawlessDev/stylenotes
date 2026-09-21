<script lang="ts">
	import {
		Pin,
		Share2,
		Trash2,
		PenLine,
		Columns2,
		Eye,
		Archive,
		ArchiveRestore,
	} from '@lucide/svelte';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		view,
		pinned,
		archived,
		onview,
		ontogglepin,
		ontogglearchive,
		onshare,
		ondelete,
	}: {
		view: EditorView;
		pinned: boolean;
		archived: boolean;
		onview: (view: EditorView) => void;
		ontogglepin: () => void;
		ontogglearchive: () => void;
		onshare: () => void;
		ondelete: () => void;
	} = $props();

	const views: { id: EditorView; icon: typeof Eye; title: string }[] = [
		{ id: 'write', icon: PenLine, title: 'Write' },
		{ id: 'split', icon: Columns2, title: 'Split' },
		{ id: 'preview', icon: Eye, title: 'Preview' },
	];
</script>

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
							onclick={() => onview(item.id)}
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
					class="glass-chip flex size-8 items-center justify-center rounded-lg transition-all {pinned
						? 'text-primary'
						: 'text-on-surface-variant hover:text-on-surface'}"
					aria-label="Pin note"
					onclick={ontogglepin}
				>
					<Pin size={16} />
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{pinned ? 'Unpin note' : 'Pin note'}</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="glass-chip flex size-8 items-center justify-center rounded-lg transition-all {archived
						? 'text-tertiary'
						: 'text-on-surface-variant hover:text-on-surface'}"
					aria-label={archived ? 'Unarchive note' : 'Archive note'}
					onclick={ontogglearchive}
				>
					{#if archived}
						<ArchiveRestore size={16} />
					{:else}
						<Archive size={16} />
					{/if}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{archived ? 'Unarchive note' : 'Archive note'}</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="glass-chip flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-on-surface"
					aria-label="Share note"
					onclick={onshare}
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
					onclick={ondelete}
				>
					<Trash2 size={16} />
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Delete note</Tooltip.Content>
	</Tooltip.Root>
</div>