<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		label,
		disabled = false,
		class: className,
		oninput
	}: {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		/** Accessible name for the slider. */
		label?: string;
		disabled?: boolean;
		class?: string;
		oninput?: (value: number) => void;
	} = $props();
</script>

<input
	type="range"
	{min}
	{max}
	{step}
	{disabled}
	aria-label={label}
	bind:value
	class={cn('range-glass', className)}
	oninput={(event) => oninput?.(Number(event.currentTarget.value))}
/>
