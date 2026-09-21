<script lang="ts">
	import { PencilLine, FolderPlus, Boxes, X } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import { defaultFolderIcons, resolveFolderIcon } from '$lib/content/folder-icons';
	import { isCustomFolder } from '$lib/stores/notes';
	import { pointerReorder } from '$lib/content/pointer-reorder';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import FolderRow from '$lib/components/workspace/FolderRow.svelte';

	let {
		folders,
		tags,
		active,
		activeTag,
		open = false,
		onclose,
		onselect,
		oncreate,
		onaddfolder,
		onselecttag,
		onrenamefolder,
		onfoldericon,
		ondeletedfolder,
		onreorder,
	}: {
		folders: Folder[];
		tags: string[];
		active: string;
		activeTag?: string | null;
		open?: boolean;
		onclose?: () => void;
		onselect: (id: string) => void;
		oncreate: () => void;
		onaddfolder?: () => void;
		onselecttag?: (tag: string | null) => void;
		onrenamefolder?: (id: string, label: string) => void;
		onfoldericon?: (id: string, icon: string) => void;
		ondeletedfolder?: (id: string) => void;
		onreorder?: (fromId: string, toId: string) => void;
	} = $props();

	let editingId = $state<string | null>(null);
	let draggingId = $state<string | null>(null);
	let overId = $state<string | null>(null);

	function select(id: string) {
		onselect(id);
		onclose?.();
	}

	const reorder = (node: HTMLElement) =>
		pointerReorder(node, {
			handleSelector: '[data-folder-handle]',
			idAttribute: 'data-folder-id',
			onStart: (id) => {
				if (id === 'all' || !onreorder) return;
				draggingId = id;
			},
			onMove: (id) => (overId = id),
			onEnd: () => {
				if (draggingId && overId && draggingId !== overId) onreorder?.(draggingId, overId);
				draggingId = null;
				overId = null;
			},
		});

	const tone: Record<string, string> = {
		primary: 'text-primary',
		secondary: 'text-secondary',
		tertiary: 'text-tertiary',
		sky: 'text-secondary',
		violet: 'text-tertiary',
		outline: 'text-outline',
	};

	function iconFor(folder: Folder) {
		return resolveFolderIcon(folder.icon) ?? defaultFolderIcons[folder.id] ?? Boxes;
	}

	const chipTone = ['text-primary', 'text-secondary', 'text-tertiary'];
</script>

<aside
	class="glass-panel flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl p-2.5 max-lg:fixed max-lg:inset-y-2.5 max-lg:left-2.5 max-lg:z-40 max-lg:max-h-[calc(100vh-1.25rem)] max-lg:shadow-2xl max-lg:transition-transform {open
		? 'max-lg:translate-x-0'
		: 'max-lg:-translate-x-[120%]'}"
>
	<div class="flex min-h-0 flex-col gap-3">
		<div class="flex items-center gap-2.5 px-1 py-1">
			<div
				class="flex size-9 items-center justify-center rounded-xl bg-surface-container-high/70 text-primary ring-1 ring-inset ring-hairline"
			>
				<img
				src="/icon-128.png"
				alt="StyleNotes"
				class="size-6 object-cover"
				/>
			</div>
			<div class="flex min-w-0 flex-col">
				<span class="text-headline-sm font-headline leading-tight text-on-surface">StyleNotes</span>
				<span class="text-label-sm font-label truncate text-outline">Your private notebook</span>
			</div>
			<button
				class="ml-auto flex size-7 items-center justify-center rounded-lg text-outline transition-colors hover:bg-surface-container/60 hover:text-on-surface lg:hidden"
				aria-label="Close folders"
				onclick={onclose}
			>
				<X size={16} />
			</button>
		</div>

		<button
			class="emphasis-container flex h-10 w-full items-center justify-between rounded-2xl px-3 text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring transition-all active:scale-[0.99]"
			onclick={oncreate}
		>
			<span class="flex items-center gap-2">
				<PencilLine size={16} />
				<span class="text-label-md font-label font-semibold">New Note</span>
			</span>
			<kbd class="rounded-md bg-surface-container-lowest/40 px-1.5 py-0.5 text-code-sm font-code"
				>Ctrl N</kbd
			>
		</button>

		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto scrollbar-none">
			<div class="mb-1 flex items-center justify-between px-1">
				<span class="text-label-sm font-label tracking-wider text-outline uppercase">Folders</span>
				<div class="flex items-center gap-0.5">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									class="flex size-5 items-center justify-center rounded-md text-outline transition-colors hover:bg-surface-container/60 hover:text-on-surface"
									aria-label="New folder"
									onclick={onaddfolder}
								>
									<FolderPlus size={15} />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>New folder</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
			<nav class="flex flex-col gap-0.5" aria-label="Folders" use:reorder>
				{#each folders as folder (folder.id)}
					<FolderRow
						{folder}
						active={active === folder.id}
						editing={editingId === folder.id}
						icon={iconFor(folder)}
						toneClass={tone[folder.tone]}
						draggable={folder.id !== 'all' && !!onreorder}
						deletable={isCustomFolder(folder.id)}
						dragging={draggingId === folder.id}
						dropping={overId === folder.id}
						onselect={() => select(folder.id)}
						onedit={folder.id === 'all' ? undefined : () => {
							editingId = editingId === folder.id ? null : folder.id;
						}}
						onrename={(label) => {
							onrenamefolder?.(folder.id, label);
							editingId = null;
						}}
						onicon={(icon) => onfoldericon?.(folder.id, icon)}
						ondelete={() => {
							ondeletedfolder?.(folder.id);
							editingId = null;
						}}
					/>
				{/each}
			</nav>
		</div>

		{#if tags.length}
			<div class="flex flex-col gap-2 border-t border-hairline px-1 pt-3">
				<div class="flex items-center justify-between">
					<span class="text-label-sm font-label tracking-wider text-outline uppercase">Tags</span>
					{#if activeTag}
						<button
							class="text-label-sm font-label text-primary transition-colors hover:brightness-110"
							onclick={() => onselecttag?.(null)}
						>
							Clear
						</button>
					{/if}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each tags as tag, i}
						<button
							class="glass-chip rounded-full px-2.5 py-1 text-code-sm font-code transition-all hover:scale-105 {activeTag ===
							tag
								? 'text-on-surface ring-1 ring-inset ring-primary/60'
								: chipTone[i % chipTone.length]}"
							aria-pressed={activeTag === tag}
							onclick={() => {
							onselecttag?.(activeTag === tag ? null : tag);
							onclose?.();
						}}
						>
							#{tag}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</aside>