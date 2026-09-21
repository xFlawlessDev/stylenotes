<script lang="ts">
	import { Check, GripVertical, Pencil, Trash2, X } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import { folderIcons } from '$lib/content/folder-icons';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		folder,
		active,
		editing = false,
		icon: Icon,
		toneClass,
		draggable = false,
		deletable = false,
		onselect,
		onedit,
		onrename,
		onicon,
		ondelete,
		ondragstart,
		ondrop,
		ondragend,
	}: {
		folder: Folder;
		active: boolean;
		editing?: boolean;
		icon: typeof GripVertical;
		toneClass?: string;
		draggable?: boolean;
		deletable?: boolean;
		onselect: () => void;
		onedit?: () => void;
		onrename: (label: string) => void;
		onicon: (icon: string) => void;
		ondelete: () => void;
		ondragstart?: (id: string) => void;
		ondrop?: (id: string) => void;
		ondragend?: () => void;
	} = $props();

	let editLabel = $state('');
	let iconOpen = $state(false);
	let over = $state(false);
	let inputEl = $state<HTMLInputElement>();

	$effect(() => {
		if (editing) {
			editLabel = folder.label;
			void Promise.resolve().then(() => inputEl?.focus());
		} else {
			iconOpen = false;
		}
	});

	function commit() {
		const label = editLabel.trim();
		if (label && label !== folder.label) onrename(label);
		else onedit?.();
	}

	function handleDragStart(event: DragEvent) {
		event.dataTransfer?.setData('text/plain', folder.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
		ondragstart?.(folder.id);
	}

	function handleDragOver(event: DragEvent) {
		if (!draggable) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		over = true;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		over = false;
		ondrop?.(folder.id);
	}
</script>

<div
	class="group relative rounded-xl transition-all {over
		? 'ring-1 ring-inset ring-primary/60'
		: ''} {draggable ? 'cursor-grab active:cursor-grabbing' : ''}"
	role="listitem"
	draggable={draggable}
	ondragstart={handleDragStart}
	ondragover={handleDragOver}
	ondragleave={() => (over = false)}
	ondrop={handleDrop}
	ondragend={() => {
		over = false;
		ondragend?.();
	}}
>
	{#if editing}
		<div class="glass-chip flex flex-col gap-2 rounded-xl px-2 py-2">
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					class="flex size-7 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-surface-container-high/70"
					aria-label="Choose icon"
					onclick={() => (iconOpen = !iconOpen)}
				>
					<Icon size={16} />
				</button>
				<input
					bind:this={inputEl}
					bind:value={editLabel}
					class="glass-well h-7 min-w-0 flex-1 rounded-lg border-0 px-2 text-body-sm font-body text-on-surface focus:outline-none"
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commit();
						} else if (event.key === 'Escape') {
							onedit?.();
						}
					}}
				/>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="flex size-7 shrink-0 items-center justify-center rounded-lg text-primary transition-colors hover:bg-surface-container-high/70"
								aria-label="Save folder"
								onclick={commit}
							>
								<Check size={15} />
							</button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Save</Tooltip.Content>
				</Tooltip.Root>
				{#if deletable}
					{@render removeFolder()}
				{/if}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="flex size-7 shrink-0 items-center justify-center rounded-lg text-outline transition-colors hover:text-on-surface"
								aria-label="Cancel"
								onclick={onedit}
							>
								<X size={15} />
							</button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Cancel</Tooltip.Content>
				</Tooltip.Root>
			</div>

			{#if iconOpen}
				<div class="flex flex-wrap gap-1 rounded-lg bg-surface-container-lowest/40 p-1.5">
					{#each folderIcons as entry (entry.id)}
						{@const Choice = entry.icon}
						<button
							type="button"
							class="flex size-7 items-center justify-center rounded-md transition-colors {folder.icon ===
							entry.id
								? 'bg-primary-container text-on-primary-container'
								: 'text-on-surface-variant hover:bg-surface-container-high/70 hover:text-on-surface'}"
							aria-label={entry.id}
							aria-pressed={folder.icon === entry.id}
							onclick={() => {
								onicon(entry.id);
								iconOpen = false;
							}}
						>
							<Choice size={14} />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="relative flex items-center justify-between rounded-xl px-2 py-2 transition-all {active
				? 'glass-chip text-on-surface'
				: 'text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface'}"
			role="button"
			tabindex="0"
			onclick={onselect}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onselect();
				}
			}}
		>
			{#if active}
				<span class="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primary"></span>
			{/if}
			<span class="flex min-w-0 items-center gap-2">
				<Icon size={17} class={active ? 'text-primary' : toneClass} />
				<span class="truncate text-body-md font-body font-medium">{folder.label}</span>
			</span>
			<span class="flex items-center gap-0.5">
				<span
					class="rounded-md px-1.5 py-0.5 text-code-sm font-code {active
						? 'text-primary'
						: 'text-outline'}"
				>
					{folder.count}
				</span>
				{#if onedit}
					<span
						class="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
					>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<button
										{...props}
										type="button"
										class="flex size-6 items-center justify-center rounded-md text-outline transition-colors hover:bg-surface-container-high/70 hover:text-on-surface"
										aria-label="Edit folder"
										onclick={(event) => {
											event.stopPropagation();
											onedit?.();
										}}
									>
										<Pencil size={13} />
									</button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>Edit folder</Tooltip.Content>
						</Tooltip.Root>
					</span>
				{/if}
				{#if draggable}
					<span class="flex size-5 items-center justify-center text-outline/70">
						<GripVertical size={14} />
					</span>
				{/if}
			</span>
		</div>
	{/if}
</div>

{#snippet removeFolder()}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="flex size-7 shrink-0 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error-container/40 hover:text-error"
					aria-label="Delete folder"
					onclick={ondelete}
				>
					<Trash2 size={15} />
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Delete folder</Tooltip.Content>
	</Tooltip.Root>
{/snippet}