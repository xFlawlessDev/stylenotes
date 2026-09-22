<script lang="ts" module>
	import type { LucideIcon } from '@lucide/svelte';

	export type SegmentItem = {
		id: string;
		label?: string;
		icon?: LucideIcon;
		ariaLabel?: string;
	};
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import Button, { type ButtonSize } from './button.svelte';

	let {
		value = $bindable(''),
		items,
		size = 'xs',
		ariaLabel,
		class: className,
		itemClass,
		onchange
	}: {
		value?: string;
		items: SegmentItem[];
		size?: Extract<ButtonSize, 'xs' | 'sm' | 'md'>;
		ariaLabel?: string;
		class?: string;
		/** Extra classes applied to every segment button. */
		itemClass?: string;
		onchange?: (value: string) => void;
	} = $props();

	function pick(id: string) {
		if (value === id) return;
		value = id;
		onchange?.(id);
	}
</script>

<div
	class={cn('glass-well flex items-center rounded-xl p-0.5', className)}
	role="group"
	aria-label={ariaLabel}
>
	{#each items as item (item.id)}
		{@const Icon = item.icon}
		<Button
			variant={value === item.id ? 'secondary' : 'ghost'}
			{size}
			class={cn('flex-1', itemClass)}
			aria-label={item.ariaLabel}
			aria-pressed={value === item.id}
			onclick={() => pick(item.id)}
		>
			{#if Icon}
				<Icon size={size === 'xs' ? 13 : 15} />
			{/if}
			{#if item.label}
				<span class="truncate">{item.label}</span>
			{/if}
		</Button>
	{/each}
</div>
