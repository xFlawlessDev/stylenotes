<script lang="ts" module>
	import { type VariantProps, tv } from './variants.js';
	import type { WithElementRef } from '$lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	export const inputVariants = tv({
		base: 'w-full min-w-0 font-body text-on-surface outline-none transition-colors placeholder:text-outline disabled:cursor-not-allowed disabled:opacity-50',
		variants: {
			variant: {
				/** Glass well – the default field look. */
				well: 'glass-well border-0 focus-visible:ring-1 focus-visible:ring-primary/50',
				/** No chrome; for fields that live inside an editor surface. */
				bare: 'border-0 bg-transparent focus-visible:ring-0',
			},
			size: {
				none: 'h-auto px-0',
				sm: 'h-7 rounded-lg px-2.5 text-body-sm',
				md: 'h-8 rounded-lg px-3 text-body-md',
				lg: 'h-9 rounded-xl px-3 text-body-md',
			},
		},
		defaultVariants: {
			variant: 'well',
			size: 'md',
		},
	});

	export type InputSize = VariantProps<typeof inputVariants>['size'];
	export type InputVariant = VariantProps<typeof inputVariants>['variant'];

	export type InputProps = WithElementRef<Omit<HTMLInputAttributes, 'size'>> & {
		size?: InputSize;
		variant?: InputVariant;
		invalid?: boolean;
	};
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	let {
		ref = $bindable(),
		value = $bindable(),
		type = 'text' as InputType,
		size = 'md',
		variant = 'well',
		invalid = false,
		class: className,
		...restProps
	}: InputProps = $props();
</script>

<input
	bind:this={ref}
	data-slot="base-input"
	class={cn(
		inputVariants({ variant, size }),
		invalid && 'ring-1 ring-inset ring-error/60 focus-visible:ring-error/60',
		className
	)}
	{type}
	bind:value
	{...restProps}
/>
