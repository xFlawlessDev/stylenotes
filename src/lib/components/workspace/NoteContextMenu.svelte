<script lang="ts">
	import {
		AppWindow,
		Archive,
		ArchiveRestore,
		Copy,
		FileDown,
		Pin,
		PinOff,
		PictureInPicture2,
		Printer,
		Share2,
		Trash2,
	} from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';

	let {
		children,
		noteId,
		title = '',
		pinned = false,
		docked = false,
		archived = false,
		onselect,
		ontogglepin,
		ontoggledock,
		ontogglearchive,
		onopenwindow,
		onprint,
		onexport,
		oncopy,
		ondelete,
	}: {
		children?: Snippet;
		noteId: string;
		title?: string;
		pinned?: boolean;
		docked?: boolean;
		archived?: boolean;
		onselect: (id: string) => void;
		ontogglepin: (id: string) => void;
		ontoggledock: (id: string) => void;
		ontogglearchive: (id: string) => void;
		onopenwindow: (id: string) => void;
		onprint: (id: string) => void;
		onexport: (id: string) => void;
		oncopy: (id: string) => void;
		ondelete: (id: string) => void;
	} = $props();

	/** Right-clicking selects the row first, so actions always match what the user sees highlighted. */
	function run(action: (id: string) => void) {
		onselect(noteId);
		action(noteId);
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="contents">
		{@render children?.()}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="min-w-48">
		<div class="px-1.5 py-1.5 text-label-sm font-label text-outline">
			{title || 'Untitled note'}
		</div>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={() => onselect(noteId)}>
			<Pin />
			Open
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => run(ontogglepin)}>
			{#if pinned}
				<PinOff />
				Unpin
			{:else}
				<Pin />
				Pin
			{/if}
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => run(onopenwindow)}>
			<AppWindow />
			Open in window
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => run(ontoggledock)}>
			<PictureInPicture2 />
			{docked ? 'Remove from dock' : 'Add to dock'}
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => run(ontogglearchive)}>
			{#if archived}
				<ArchiveRestore />
				Unarchive
			{:else}
				<Archive />
				Archive
			{/if}
		</ContextMenu.Item>
		<ContextMenu.Sub>
			<ContextMenu.SubTrigger>
				<Share2 />
				Share
			</ContextMenu.SubTrigger>
			<ContextMenu.SubContent class="min-w-40">
				<ContextMenu.Item onSelect={() => run(onprint)}>
					<Printer />
					Print
				</ContextMenu.Item>
				<ContextMenu.Item onSelect={() => run(onexport)}>
					<FileDown />
					Export .md
				</ContextMenu.Item>
				<ContextMenu.Item onSelect={() => run(oncopy)}>
					<Copy />
					Copy all
				</ContextMenu.Item>
			</ContextMenu.SubContent>
		</ContextMenu.Sub>
		<ContextMenu.Separator />
		<ContextMenu.Item variant="destructive" onSelect={() => run(ondelete)}>
			<Trash2 />
			Delete
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
