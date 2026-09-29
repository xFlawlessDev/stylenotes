<script lang="ts" module>
	import { computePosition, flip, offset, shift } from '@floating-ui/dom';

	/** Positions the mention list just above the composer's caret area. */
	export async function positionMentionPopover(
		anchor: HTMLElement,
		popover: HTMLElement
	): Promise<void> {
		const { x, y } = await computePosition(anchor, popover, {
			placement: 'top-start',
			middleware: [offset(6), flip(), shift({ padding: 8 })]
		});
		popover.style.left = `${x}px`;
		popover.style.top = `${y}px`;
	}
</script>

<script lang="ts">
	import type { MentionSuggestion } from '$lib/content/ai-mentions';
	import { t } from '$lib/i18n/index.svelte';

	let {
		open = false,
		anchor,
		items = [],
		index = 0,
		onselect,
		onhover
	}: {
		open?: boolean;
		/** The composer textarea the list floats above. */
		anchor: HTMLElement | null;
		items?: MentionSuggestion[];
		index?: number;
		onselect: (item: MentionSuggestion) => void;
		onhover?: (index: number) => void;
	} = $props();

	let listEl = $state<HTMLElement | null>(null);

	$effect(() => {
		const target = anchor;
		const el = listEl;
		if (open && target && el) void positionMentionPopover(target, el);
	});

	/** Keep the active row visible when the selection moves by keyboard. */
	$effect(() => {
		const active = index;
		if (active < 0) return;
		const row = listEl?.querySelector<HTMLElement>(`[data-mention-index="${active}"]`);
		if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<ul
		bind:this={listEl}
		class="glass-solid fixed z-[70] max-h-60 w-72 overflow-y-auto rounded-xl border border-outline-variant/30 p-1 shadow-xl"
		role="listbox"
		tabindex="-1"
		aria-label={t('ai.mentionLabel')}
	>
		{#each items as item, position (item.entity.kind + ':' + item.entity.id)}
			<li
				data-mention-index={position}
				role="option"
				aria-selected={position === index}
				class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-body-sm font-body {position ===
				index
					? 'bg-primary/15 text-on-surface'
					: 'text-on-surface-variant hover:bg-surface-container/60'}"
				onmouseenter={() => onhover?.(position)}
				onmousedown={(event) => {
					// `mousedown` keeps the caret in the textarea, unlike `click`.
					event.preventDefault();
					onselect(item);
				}}
			>
				<span class="min-w-0 flex-1 truncate">
					{#if item.highlight[1]}
						{item.highlight[0]}<mark class="bg-transparent font-medium text-primary"
							>{item.highlight[1]}</mark
						>{item.highlight[2]}
					{:else}
						{item.entity.title}
					{/if}
				</span>
				<span class="shrink-0 text-code-sm font-code text-outline"
					>{t(item.entity.kind === 'task' ? 'graph.node.task' : 'graph.node.note')}</span
				>
			</li>
		{/each}

		{#if !items.length}
			<li class="px-2 py-1.5 text-body-sm font-body text-outline">{t('ai.noMatches')}</li>
		{/if}
	</ul>
{/if}
