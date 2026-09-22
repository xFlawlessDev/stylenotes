<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import Button from './button.svelte';
	import Input from './input.svelte';

	let {
		value = $bindable(''),
		placeholder = 'Search',
		ariaLabel = 'Search',
		clearable = true,
		class: className,
		onquery
	}: {
		value?: string;
		placeholder?: string;
		ariaLabel?: string;
		clearable?: boolean;
		class?: string;
		onquery?: (value: string) => void;
	} = $props();
</script>

<div class={cn('relative w-full', className)}>
	<Search
		size={15}
		class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-on-surface-variant"
	/>
	<Input
		size="lg"
		{placeholder}
		aria-label={ariaLabel}
		class={cn('pl-9 text-body-sm', clearable && value ? 'pr-9' : 'pr-3')}
		bind:value
		oninput={(event) => onquery?.(event.currentTarget.value)}
	/>
	{#if clearable && value}
		<Button
			size="icon-xs"
			class="absolute top-1/2 right-2 -translate-y-1/2"
			aria-label="Clear search"
			onclick={() => {
				value = '';
				onquery?.('');
			}}
		>
			<X size={13} />
		</Button>
	{/if}
</div>
