<script lang="ts">
	import {
		PencilLine,
		FolderPlus,
		Boxes,
		Briefcase,
		Lightbulb,
		Code2,
		User,
		Archive,
	} from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		folders,
		tags,
		active,
		activeTag,
		onselect,
		oncreate,
		onaddfolder,
		onselecttag,
	}: {
		folders: Folder[];
		tags: string[];
		active: string;
		activeTag?: string | null;
		onselect: (id: string) => void;
		oncreate: () => void;
		onaddfolder?: () => void;
		onselecttag?: (tag: string | null) => void;
	} = $props();

	const tone: Record<string, string> = {
		primary: 'text-primary',
		secondary: 'text-secondary',
		tertiary: 'text-tertiary',
		sky: 'text-secondary',
		violet: 'text-tertiary',
		outline: 'text-outline',
	};

	const folderIcon: Record<string, typeof Boxes> = {
		all: Boxes,
		work: Briefcase,
		ideas: Lightbulb,
		dev: Code2,
		personal: User,
		archive: Archive,
	};

	function iconFor(id: string) {
		return folderIcon[id] ?? Boxes;
	}

	const chipTone = ['text-primary', 'text-secondary', 'text-tertiary'];
</script>

<aside class="glass-panel flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl p-2.5">
	<div class="flex min-h-0 flex-col gap-3">
		<div class="flex items-center gap-2.5 px-1 py-1">
			<div
				class="flex size-9 items-center justify-center rounded-xl bg-surface-container-high/70 text-primary ring-1 ring-inset ring-white/5"
			>
				<PencilLine size={18} />
			</div>
			<div class="flex min-w-0 flex-col">
				<span class="text-headline-sm font-headline leading-tight text-on-surface">StyleNotes</span>
				<span class="text-label-sm font-label truncate text-outline">Your private notebook</span>
			</div>
		</div>

		<button
			class="flex h-10 w-full items-center justify-between rounded-xl bg-primary-container px-3 text-on-primary-container transition-all hover:bg-primary-container/80 active:scale-[0.99]"
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
			<nav class="flex flex-col gap-0.5">
				{#each folders as folder (folder.id)}
					{@const Icon = iconFor(folder.id)}
					<button
						class="relative flex items-center justify-between rounded-xl px-2 py-2 transition-all {active ===
						folder.id
							? 'glass-chip text-on-surface'
							: 'text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface'}"
						onclick={() => onselect(folder.id)}
					>
						{#if active === folder.id}
							<span
								class="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primary"
							></span>
						{/if}
						<span class="flex items-center gap-2">
							<Icon size={17} class={active === folder.id ? 'text-primary' : tone[folder.tone]} />
							<span class="text-body-md font-body font-medium">{folder.label}</span>
						</span>
						<span
							class="rounded-md px-1.5 py-0.5 text-code-sm font-code {active === folder.id
								? 'text-primary'
								: 'text-outline'}"
						>
							{folder.count}
						</span>
					</button>
				{/each}
			</nav>
		</div>

		{#if tags.length}
			<div class="flex flex-col gap-2 border-t border-white/5 px-1 pt-3">
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
							onclick={() => onselecttag?.(activeTag === tag ? null : tag)}
						>
							#{tag}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</aside>