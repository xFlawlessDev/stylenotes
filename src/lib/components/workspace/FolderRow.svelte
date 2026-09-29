<script lang="ts">
	import { Check, GripVertical, Pencil, Trash2, X } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import { folderIcons } from '$lib/content/folder-icons';
	import { t } from '$lib/i18n/index.svelte';
	import { Button, Input } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		folder,
		active,
		editing = false,
		icon: Icon,
		toneClass,
		draggable = false,
		deletable = false,
		dragging = false,
		dropping = false,
		onselect,
		onedit,
		onrename,
		onicon,
		ondelete,
	}: {
		folder: Folder;
		active: boolean;
		editing?: boolean;
		icon: typeof GripVertical;
		toneClass?: string;
		draggable?: boolean;
		deletable?: boolean;
		dragging?: boolean;
		dropping?: boolean;
		onselect: () => void;
		onedit?: () => void;
		onrename: (label: string) => void;
		onicon: (icon: string) => void;
		ondelete: () => void;
	} = $props();

	let editLabel = $state('');
	let iconOpen = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

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
</script>

<div
	class="group relative rounded-xl transition-all {dropping
		? 'ring-1 ring-inset ring-primary/60'
		: ''} {dragging ? 'opacity-50' : ''}"
	role="listitem"
	data-folder-id={folder.id}
>
	{#if editing}
		<div class="glass-chip flex flex-col gap-2 rounded-xl px-2 py-2">
			<div class="flex items-center gap-1.5">
				<Button
					size="icon-sm"
					class="shrink-0 text-primary"
					aria-label={t('notes.chooseIcon')}
					onclick={() => (iconOpen = !iconOpen)}
				>
					<Icon size={16} />
				</Button>
				<Input
					bind:ref={inputEl}
					bind:value={editLabel}
					size="sm"
					class="min-w-0 flex-1"
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
							<Button
								{...props}
								size="icon-sm"
								class="shrink-0 text-primary"
								aria-label={t('notes.saveFolder')}
								onclick={commit}
							>
								<Check size={15} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{t('common.save')}</Tooltip.Content>
				</Tooltip.Root>
				{#if deletable}
					{@render removeFolder()}
				{/if}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								size="icon-sm"
								class="shrink-0 text-outline"
								aria-label={t('common.cancel')}
								onclick={onedit}
							>
								<X size={15} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{t('common.cancel')}</Tooltip.Content>
				</Tooltip.Root>
			</div>

			{#if iconOpen}
				<div class="flex flex-wrap gap-1 rounded-lg bg-surface-container-lowest/40 p-1.5">
					{#each folderIcons as entry (entry.id)}
						{@const Choice = entry.icon}
						<Button
							size="icon-sm"
							variant={folder.icon === entry.id ? 'tonal' : 'ghost'}
							aria-label={entry.id}
							aria-pressed={folder.icon === entry.id}
							onclick={() => {
								onicon(entry.id);
								iconOpen = false;
							}}
						>
							<Choice size={14} />
						</Button>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="relative flex items-center justify-between rounded-2xl px-2 py-2 transition-all {active
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
				<span class="emphasis-primary absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full"></span>
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
									<Button
										{...props}
										size="icon-xs"
										class="text-outline"
										aria-label={t('notes.editFolder')}
										onclick={(event) => {
											event.stopPropagation();
											onedit?.();
										}}
									>
										<Pencil size={13} />
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>{t('notes.editFolder')}</Tooltip.Content>
						</Tooltip.Root>
					</span>
				{/if}
				{#if draggable}
					<span
						data-folder-handle
						class="flex size-5 cursor-grab items-center justify-center text-outline/70 active:cursor-grabbing"
					>
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
				<Button
					{...props}
					variant="danger-ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label={t('notes.deleteFolder')}
					onclick={ondelete}
				>
					<Trash2 size={15} />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>{t('notes.deleteFolder')}</Tooltip.Content>
	</Tooltip.Root>
{/snippet}