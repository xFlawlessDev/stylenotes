<script lang="ts">
	import { offset } from '@floating-ui/dom';
	import type { WikiSuggestion } from '$lib/content/wiki-autocomplete';
	import { kindLabel } from '$lib/content/wiki-autocomplete';

	let {
		open = false,
		target,
		items = [],
		index = 0,
		onselect,
		onhover
	}: {
		open?: boolean;
		/** The textarea the popover floats above. */
		target: HTMLElement | null;
		items?: WikiSuggestion[];
		index?: number;
		onselect: (item: WikiSuggestion) => void;
		/** Lets the editor keep its own active item in step with the pointer. */
		onhover?: (index: number) => void;
	} = $props();

	let listEl = $state<HTMLElement | null>(null);

	/** Keep the active row visible when the selection moves by keyboard. */
	$effect(() => {
		const active = index;
		if (active < 0) return;
		const row = listEl?.querySelector<HTMLElement>(`[data-wiki-index="${active}"]`);
		// `scrollIntoView` is missing in jsdom, and optional on some engines.
		if (typeof row?.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<ul
		bind:this={listEl}
		class="glass-solid max-h-60 w-72 overflow-y-auto rounded-xl border border-outline-variant/30 p-1 shadow-xl"
		role="listbox"
		tabindex="-1"
		aria-label="Wiki link suggestions"
	>
		{#each items as item, position (item.entity.kind + ':' + item.entity.id)}
			<li
				id="wiki-option-{position}"
				data-wiki-index={position}
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
				<span class="shrink-0 text-code-sm font-code text-outline">{kindLabel(item.entity.kind)}</span>
			</li>
		{/each}

		{#if !items.length}
			<li class="px-2 py-1.5 text-body-sm font-body text-outline">No notes or tasks match.</li>
		{/if}
	</ul>
{/if}

<script lang="ts" module>
	import { computePosition, flip, shift } from '@floating-ui/dom';

	/**
	 * Positions the popover just under the caret. It anchors to the textarea box
	 * rather than the exact glyph: the textarea font metrics are not exposed, so
	 * an approximate caret would be worse than a stable, predictable anchor.
	 */
	export async function positionWikiPopover(
		textarea: HTMLTextAreaElement,
		popover: HTMLElement
	): Promise<void> {
		await computePosition(
			{
				getBoundingClientRect: () => {
					const box = textarea.getBoundingClientRect();
					return {
						x: box.x,
						y: box.y + textarea.scrollTop,
						width: box.width,
						height: box.height,
						top: box.y + textarea.scrollTop,
						left: box.x,
						right: box.right,
						bottom: box.bottom + textarea.scrollTop
					};
				},
				contextElement: textarea
			},
			popover,
			{ placement: 'bottom-start', middleware: [offset(4), flip(), shift({ padding: 8 })] }
		).then(({ x, y }) => {
			popover.style.left = `${x}px`;
			popover.style.top = `${y}px`;
		});
	}
</script>
