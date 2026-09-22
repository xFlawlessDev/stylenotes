<script lang="ts" module>
	import { type VariantProps, tv } from './variants.js';
	import type { WithElementRef } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	export const textareaVariants = tv({
		base: 'w-full min-w-0 resize-none font-body text-on-surface outline-none transition-colors placeholder:text-outline disabled:cursor-not-allowed disabled:opacity-50',
		variants: {
			variant: {
				well: 'glass-well border-0 px-3 py-2 focus-visible:ring-1 focus-visible:ring-primary/50',
				bare: 'border-0 bg-transparent',
			},
			size: {
				sm: 'text-body-sm',
				md: 'text-body-md',
				lg: 'text-body-lg leading-relaxed',
			},
		},
		defaultVariants: {
			variant: 'well',
			size: 'md',
		},
	});

	export type TextareaSize = VariantProps<typeof textareaVariants>['size'];
	export type TextareaVariant = VariantProps<typeof textareaVariants>['variant'];

	export type TextareaProps = WithElementRef<HTMLTextareaAttributes> & {
		size?: TextareaSize;
		variant?: TextareaVariant;
		invalid?: boolean;
	};
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(),
		value = $bindable(),
		size = 'md',
		variant = 'well',
		invalid = false,
		class: className,
		...restProps
	}: TextareaProps = $props();
</script>

<textarea
	bind:this={ref}
	data-slot="base-textarea"
	class={cn(
		textareaVariants({ variant, size }),
		invalid && 'ring-1 ring-inset ring-error/60 focus-visible:ring-error/60',
		className
	)}
	bind:value
	{...restProps}
></textarea>
