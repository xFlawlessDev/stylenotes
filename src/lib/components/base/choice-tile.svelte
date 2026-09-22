<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import Button from './button.svelte';

	let {
		active = false,
		layout = 'stack',
		label,
		icon: Icon,
		class: className,
		onclick,
		children
	}: {
		active?: boolean;
		/** `row` for label + icon side by side, `stack` for tiles that stack content. */
		layout?: 'row' | 'stack';
		label?: string;
		icon?: LucideIcon;
		class?: string;
		onclick?: () => void;
		children?: Snippet;
	} = $props();
</script>

<Button
	variant={active ? 'tonal' : 'soft'}
	size="lg"
	shape="tile"
	block
	class={cn('h-auto py-2.5', layout === 'row' ? 'gap-2' : 'flex-col gap-1.5', className)}
	aria-pressed={active}
	{onclick}
>
	{#if Icon}
		<Icon size={15} class="shrink-0" />
	{/if}
	{@render children?.()}
	{#if label}
		<span class={layout === 'row' ? '' : 'text-label-sm font-label'}>{label}</span>
	{/if}
</Button>
