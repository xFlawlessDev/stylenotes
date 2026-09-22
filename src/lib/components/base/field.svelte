<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		label,
		for: htmlFor,
		hint,
		description,
		legend = false,
		labelClass,
		class: className,
		children
	}: {
		label?: string;
		/** Links the label to a control id. Without it a plain group wrapper renders. */
		for?: string;
		/** Small qualifier appended to the label, e.g. `optional`. */
		hint?: string;
		description?: string;
		/** Uppercase section-legend styling instead of a field label. */
		legend?: boolean;
		/** Extra classes for the label text itself. */
		labelClass?: string;
		class?: string;
		children?: Snippet;
	} = $props();

	const headingClass = $derived(
		legend
			? cn('text-label-sm font-label tracking-wider text-outline uppercase', labelClass)
			: cn('text-label-md font-label text-on-surface-variant', labelClass)
	);
</script>

{#snippet heading()}
	{#if label}
		<span class={headingClass}>
			{label}{#if hint}<span class="text-outline normal-case">({hint})</span>{/if}
		</span>
	{/if}
{/snippet}

{#snippet body()}
	{@render heading()}
	{@render children?.()}
	{#if description}
		<span class="text-label-sm font-label leading-relaxed text-outline">{description}</span>
	{/if}
{/snippet}

{#if htmlFor}
	<label class={cn('flex min-w-0 flex-col gap-1.5', className)} for={htmlFor}>
		{@render body()}
	</label>
{:else}
	<div class={cn('flex min-w-0 flex-col gap-1.5', className)}>
		{@render body()}
	</div>
{/if}
