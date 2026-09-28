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
		Maximize2,
		AppWindow,
		PictureInPicture2,
		Printer,
		FileDown,
		Copy,
		History,
	} from '@lucide/svelte';
	import type { EditorView } from '$lib/stores/settings.svelte';
	import { Button } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		view,
		pinned,
		docked,
		archived,
		onview,
		ontogglepin,
		ontoggledock,
		ontogglearchive,
		onopenwindow,
		onprint,
		onexport,
		oncopy,
		ondelete,
		onfullpreview,
		onhistory,
	}: {
		view: EditorView;
		pinned: boolean;
		docked: boolean;
		archived: boolean;
		onview: (view: EditorView) => void;
		ontogglepin: () => void;
		ontoggledock: () => void;
		ontogglearchive: () => void;
		onopenwindow: () => void;
		onprint: () => void;
		onexport: () => void;
		oncopy: () => void;
		ondelete: () => void;
		onfullpreview: () => void;
		onhistory?: () => void;
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
						<Button
							{...props}
							variant={view === item.id ? 'tonal' : 'ghost'}
							size="icon-sm"
							aria-label={item.title}
							aria-pressed={view === item.id}
							onclick={() => onview(item.id)}
						>
							<Icon size={15} />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{item.title}</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="secondary"
					size="icon"
					class="text-on-surface-variant"
					aria-label="Full preview"
					onclick={onfullpreview}
				>
					<Maximize2 size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Full preview</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={pinned ? 'tonal' : 'secondary'}
					size="icon"
					class={pinned ? undefined : 'text-on-surface-variant'}
					aria-label="Pin note"
					aria-pressed={pinned}
					onclick={ontogglepin}
				>
					<Pin size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{pinned ? 'Unpin note' : 'Pin note'}</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="secondary"
					size="icon"
					class="text-on-surface-variant"
					aria-label="Open in note window"
					onclick={onopenwindow}
				>
					<AppWindow size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Open in note window</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={docked ? 'tonal' : 'secondary'}
					size="icon"
					class={docked ? undefined : 'text-on-surface-variant'}
					aria-label={docked ? 'Remove from dock' : 'Add to dock'}
					aria-pressed={docked}
					onclick={ontoggledock}
				>
					<PictureInPicture2 size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{docked ? 'Remove from dock' : 'Add to dock'}</Tooltip.Content>
	</Tooltip.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={archived ? 'tonal' : 'secondary'}
					size="icon"
					class={archived ? undefined : 'text-on-surface-variant'}
					aria-label={archived ? 'Unarchive note' : 'Archive note'}
					aria-pressed={archived}
					onclick={ontogglearchive}
				>
					{#if archived}
						<ArchiveRestore size={16} />
					{:else}
						<Archive size={16} />
					{/if}
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{archived ? 'Unarchive note' : 'Archive note'}</Tooltip.Content>
	</Tooltip.Root>
	{#if onhistory}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon"
						class="text-on-surface-variant"
						aria-label="Version history"
						onclick={onhistory}
					>
						<History size={16} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Version history</Tooltip.Content>
		</Tooltip.Root>
	{/if}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="secondary"
					size="icon"
					class="text-on-surface-variant"
					aria-label="Share note"
				>
					<Share2 size={16} />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-40">
			<DropdownMenu.Item onSelect={onprint}>
				<Printer />
				Print
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={onexport}>
				<FileDown />
				Export .md
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={oncopy}>
				<Copy />
				Copy all
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="secondary"
					size="icon"
					class="text-on-surface-variant hover:bg-error-container/40 hover:text-error"
					aria-label="Delete note"
					onclick={ondelete}
				>
					<Trash2 size={16} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Delete note</Tooltip.Content>
	</Tooltip.Root>
</div>