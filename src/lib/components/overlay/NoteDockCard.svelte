<script lang="ts">
	import { ArrowUpRight, FileText, X } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
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
</script>

<div
	class="glass-solid flex w-full flex-col gap-2 rounded-xl p-3 shadow-2xl ring-1 ring-hairline"
	role="tooltip"
	onmouseleave={onclose}
>
	<div class="flex items-center justify-between">
		<span
			class="flex items-center gap-1.5 text-label-sm font-label font-semibold tracking-wider text-tertiary uppercase"
		>
			<FileText size={12} />
			Quick note
		</span>
		<span class="flex items-center gap-1 text-code-sm font-code text-on-surface-variant">
			{note.words} {note.words === 1 ? 'word' : 'words'}
		</span>
	</div>

	<div class="flex flex-col gap-1">
		<h2 class="text-headline-sm font-headline leading-tight text-on-surface">
			{note.title || 'Untitled note'}
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
		{#if note.pinned}
			<span class="rounded-md px-1.5 py-px text-code-sm font-code text-tertiary">Pinned</span>
		{/if}
	</div>

	<div class="flex items-center justify-end gap-0.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-error-container/40 hover:text-error"
						aria-label="Remove from dock"
						onclick={() => onremove(note)}
					>
						<X size={15} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Remove from dock</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<button
		class="emphasis-container flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-headline-sm font-headline text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring transition-all active:scale-[0.99]"
		onclick={onopen}
	>
		<span class="relative">Edit note</span>
		<ArrowUpRight size={14} />
	</button>
</div>
