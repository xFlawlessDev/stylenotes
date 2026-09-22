<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		checked = $bindable(false),
		disabled = false,
		label,
		size = 'md',
		class: className,
		onchange
	}: {
		checked?: boolean;
		disabled?: boolean;
		/** Accessible name; the visible label usually lives in the surrounding row. */
		label?: string;
		size?: 'sm' | 'md';
		class?: string;
		onchange?: (checked: boolean) => void;
	} = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	class={cn(
		'relative shrink-0 rounded-full border border-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40',
		size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
		checked ? 'emphasis-primary' : 'bg-surface-container-highest',
		className
	)}
	onclick={toggle}
>
	<span
		class={cn(
			'absolute top-0.5 rounded-full transition-transform',
			size === 'sm' ? 'size-3' : 'size-4',
			checked ? 'right-0.5 bg-on-primary' : 'left-0.5 bg-outline'
		)}
	></span>
</button>
