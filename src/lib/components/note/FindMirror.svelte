<script lang="ts">
	import { findSegments, type FindMatch } from '$lib/content/find';

	/**
	 * Layered text behind a textarea: the same text, with every match wrapped in
	 * `<mark>`. The textarea renders its glyphs transparently over this so all
	 * matches are visible at once, which native textarea selection cannot do.
	 *
	 * The caller owns the stacking context and passes the exact text metrics
	 * (`style`) and the current `scrollTop`, so the layers stay in lockstep.
	 */
	let {
		text,
		matches = [],
		activeIndex = 0,
		style = '',
		scrollTop = 0
	}: {
		text: string;
		matches?: FindMatch[];
		activeIndex?: number;
		style?: string;
		scrollTop?: number;
	} = $props();

	const segments = $derived(findSegments(text, matches, activeIndex));
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	<div style="{style}; transform: translateY(-{scrollTop}px)">
		{#each segments as segment, index (index)}<!--
			-->{#if segment.match}<mark class={segment.active ? 'find-mark find-mark--active' : 'find-mark'}
				>{segment.text}</mark
			>{:else}{segment.text}{/if}<!--
		-->{/each}
	</div>
</div>
