<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	let {
		icon: Icon,
		title,
		heading,
		description,
		size = 'sm',
		class: className,
		children
	}: {
		icon?: LucideIcon;
		title: string;
		/** Larger heading above the message, for full-panel empty states. */
		heading?: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		children?: Snippet;
	} = $props();

	const box = $derived(
		size === 'sm'
			? { class: 'size-11', icon: 20 }
			: size === 'md'
				? { class: 'size-12', icon: 22 }
				: { class: 'size-14', icon: 26 }
	);
</script>

{#snippet message()}
	{#if heading}
		<h2 class="text-headline-md font-headline text-on-surface">{heading}</h2>
	{/if}
	<p class="text-body-sm font-body text-outline">{title}</p>
	{#if description}
		<p class="text-label-sm font-label leading-relaxed text-outline/80">{description}</p>
	{/if}
{/snippet}

<div
	class={cn('flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center', className)}
>
	{#if Icon}
		<div
			class={cn(
				'glass-well flex items-center justify-center rounded-2xl text-outline',
				box.class
			)}
		>
			<Icon size={box.icon} />
		</div>
	{/if}
	{#if heading}
		<div class="flex flex-col gap-1">
			{@render message()}
		</div>
	{:else}
		{@render message()}
	{/if}
	{@render children?.()}
</div>
