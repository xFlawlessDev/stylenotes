<script lang="ts">
	import { PencilLine, FolderPlus, NotebookPen } from '@lucide/svelte';
	import type { Folder } from '$lib/stores/notes';
	import { t } from '$lib/i18n/index.svelte';
	import { Button } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import RailShell from '$lib/components/workspace/RailShell.svelte';
	import FolderList from '$lib/components/workspace/FolderList.svelte';

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

	function select(id: string) {
		onselect(id);
		onclose?.();
	}

	function pickTag(tag: string | null) {
		onselecttag?.(tag);
		onclose?.();
	}

	const chipTone = ['text-primary', 'text-secondary', 'text-tertiary'];
</script>

<RailShell
	title={t('notes.railTitle')}
	subtitle={t('notes.railSubtitle')}
	icon={NotebookPen}
	closeLabel={t('notes.closeFolders')}
	{open}
	{onclose}
>
	{#snippet action()}
		<Button
			variant="tonal"
			size="lg"
			shape="tile"
			block
			class="justify-between px-3 active:scale-[0.99]"
			onclick={oncreate}
		>
			<span class="flex items-center gap-2">
				<PencilLine size={16} />
				<span class="text-label-md font-label font-semibold">{t('common.newNote')}</span>
			</span>
			<kbd class="rounded-md bg-surface-container-lowest/40 px-1.5 py-0.5 text-code-sm font-code"
				>Ctrl N</kbd
			>
		</Button>
	{/snippet}

	<!-- Folders -->
	<div class="flex flex-col gap-0.5 border-hairline pb-3">
		<div class="mb-1 flex shrink-0 items-center justify-between px-1">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase"
				>{t('notes.folders')}</span
			>
			<div class="flex items-center gap-0.5">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								size="icon-xs"
								class="text-outline"
								aria-label={t('notes.folderNew')}
								onclick={onaddfolder}
							>
								<FolderPlus size={15} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{t('notes.folderNew')}</Tooltip.Content>
				</Tooltip.Root>
			</div>
		</div>
		<FolderList
			{folders}
			{active}
			onselect={select}
			{onrenamefolder}
			{onfoldericon}
			{ondeletedfolder}
			{onreorder}
		/>
	</div>

	{#if tags.length}
		<div class="flex flex-col gap-2 border-t border-hairline px-1 pt-3">
			<div class="flex items-center justify-between">
				<span class="text-label-sm font-label tracking-wider text-outline uppercase"
					>{t('notes.tags')}</span
				>
				{#if activeTag}
					<Button
						variant="ghost"
						size="xs"
						class="px-0 text-primary hover:bg-transparent"
						onclick={() => pickTag(null)}
					>
						{t('notes.clear')}
					</Button>
				{/if}
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each tags as tag, i}
					<Button
						variant="secondary"
						size="xs"
						shape="pill"
						class="px-2.5 font-code text-code-sm hover:scale-105 {activeTag === tag
							? 'text-on-surface ring-1 ring-inset ring-primary/60'
							: chipTone[i % chipTone.length]}"
						aria-pressed={activeTag === tag}
						onclick={() => pickTag(activeTag === tag ? null : tag)}
					>
						#{tag}
					</Button>
				{/each}
			</div>
		</div>
	{/if}
</RailShell>
