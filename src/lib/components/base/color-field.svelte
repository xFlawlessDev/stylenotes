<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import Button from './button.svelte';
	import Input from './input.svelte';

	let {
		value = $bindable(''),
		hex,
		label,
		placeholder = 'theme default',
		dirty = false,
		class: className,
		onchange,
		onreset
	}: {
		value?: string;
		/** Text-field value when it differs from the swatch color (e.g. unset token). */
		hex?: string;
		/** Visible row label and accessible name for both inputs. */
		label?: string;
		placeholder?: string;
		/** Enables the reset button when the field differs from the default. */
		dirty?: boolean;
		class?: string;
		/** Fired on every change, including live color-picker drags. */
		onchange?: (value: string) => void;
		onreset?: () => void;
	} = $props();

	function commit(next: string) {
		value = next;
		onchange?.(next);
	}
</script>

<div class={cn('flex min-w-0 items-center gap-2', className)}>
	<input
		type="color"
		class="color-swatch size-8 shrink-0"
		aria-label="{label ?? 'Color'} color"
		{value}
		oninput={(event) => commit(event.currentTarget.value)}
	/>
	<span class="w-20 shrink-0 truncate text-body-md font-body text-on-surface">{label}</span>
	<Input
		size="sm"
		class="w-0 min-w-0 flex-1 font-code text-code-sm"
		{placeholder}
		aria-label="{label ?? 'Color'} hex"
		value={hex ?? value}
		onchange={(event) => commit(event.currentTarget.value)}
	/>
	<Button
		size="icon-sm"
		disabled={!dirty}
		aria-label="Reset {label ?? 'color'}"
		onclick={onreset}
	>
		<RotateCcw size={13} />
	</Button>
</div>
