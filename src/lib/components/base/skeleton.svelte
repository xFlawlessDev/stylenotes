<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * A shimmering placeholder block for content that is still loading.
	 *
	 * The pulse is switched off by the `reduced` motion setting (`layout.css`
	 * collapses every animation), so for a user who opted out of motion it stays
	 * a quiet grey block rather than turning back into a busy surface.
	 */
	let {
		class: className,
		rounded = 'md',
		...rest
	}: HTMLAttributes<HTMLSpanElement> & { rounded?: 'sm' | 'md' | 'full' } = $props();

	const radius = { sm: 'rounded', md: 'rounded-md', full: 'rounded-full' } as const;
</script>

<span
	data-slot="base-skeleton"
	class={cn('block animate-pulse bg-surface-container-high/70', radius[rounded], className)}
	aria-hidden="true"
	{...rest}
></span>
