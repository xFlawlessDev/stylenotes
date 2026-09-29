<script lang="ts">
	import { ArrowUpRight, FileText, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import type { Note } from '$lib/content/content';
	import { t } from '$lib/i18n/index.svelte';
	import { workspaceLookup } from '$lib/workspace-sync.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		note,
		onopen,
		onremove,
		onclose
	}: {
		note: Note;
		onopen: () => void;
		onremove: (note: Note) => void;
		onclose: () => void;
	} = $props();

	const folderLabel = $derived(
		note.folder.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
	);
	const workspace = $derived(workspaceLookup()(note.workspaceId));
</script>

<div
	class="glass-solid flex w-full flex-col gap-2 rounded-xl p-3 ring-1 ring-hairline shadow-none"
	role="tooltip"
	onmouseleave={onclose}
>
	<div class="flex items-center justify-between">
		<span
			class="flex items-center gap-1.5 text-label-sm font-label font-semibold tracking-wider text-tertiary uppercase"
		>
			<FileText size={12} />
			{t('notes.badge.quickNote')}
		</span>
		<span class="flex items-center gap-1 text-code-sm font-code text-on-surface-variant">
			{note.words === 1
				? t('common.wordsOne', { count: note.words })
				: t('common.words', { count: note.words })}
		</span>
	</div>

	<div class="flex flex-col gap-1">
		<h2 class="text-headline-sm font-headline leading-tight text-on-surface">
			{note.title || t('common.untitledNote')}
		</h2>
		{#if note.excerpt}
			<p class="line-clamp-2 text-body-sm font-body leading-relaxed text-on-surface-variant">
				{note.excerpt}
			</p>
		{/if}
	</div>

	<div class="flex items-center gap-1.5">
		<span class="rounded-md bg-surface-container-highest px-1.5 py-px text-code-sm font-code text-on-surface">
			{folderLabel}
		</span>
		<WorkspaceBadge name={workspace.name} color={workspace.color} />
		{#if note.pinned}
			<span class="rounded-md px-1.5 py-px text-code-sm font-code text-tertiary">{t('notes.badge.pinned')}</span>
		{/if}
	</div>

	<div class="flex items-center justify-end gap-0.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-sm"
						class="text-on-surface-variant hover:bg-error-container/40 hover:text-error"
						aria-label={t('over.noteCard.removeFromDock')}
						onclick={() => onremove(note)}
					>
						<X size={15} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{t('over.noteCard.removeFromDock')}</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<Button
		variant="tonal"
		size="md"
		shape="tile"
		block
		class="gap-1.5 px-3 py-1.5 font-headline text-headline-sm active:scale-[0.99]"
		onclick={onopen}
	>
		<span class="relative">{t('over.noteCard.edit')}</span>
		<ArrowUpRight size={14} />
	</Button>
</div>
