<script lang="ts" module>
	import { type VariantProps, tv } from './variants.js';
	import type { WithElementRef } from '$lib/utils.js';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Single button base for the whole app. Variants cover the Material 3 glass
	 * language used across StyleNotes:
	 *
	 * - `primary`  – the one main action on a surface (emphasis gradient)
	 * - `secondary`– glass chip, for actions that sit on glass panels
	 * - `tonal`    – selected/active counterpart of `soft`
	 * - `soft`     – quiet filled surface (option rows, tiles)
	 * - `ghost`    – icon and toolbar buttons
	 * - `outline`  – neutral action on busy surfaces
	 * - `danger` / `danger-ghost` – destructive actions
	 */
	const structural =
		'inline-flex shrink-0 items-center justify-center gap-1.5 font-label outline-none transition-all select-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0';

	export const buttonVariants = tv({
		base: `${structural} border border-transparent whitespace-nowrap`,
		variants: {
			variant: {
				primary:
					'emphasis-primary text-on-primary ring-1 ring-inset ring-emphasis-ring hover:brightness-105',
				secondary: 'glass-chip text-on-surface hover:text-primary',
				tonal: 'emphasis-container text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring',
				soft: 'bg-surface-container-lowest/30 text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface',
				ghost: 'text-on-surface-variant hover:bg-surface-container/50 hover:text-on-surface',
				outline:
					'border-outline-variant text-on-surface-variant hover:bg-surface-container/40 hover:text-on-surface',
				danger: 'bg-error-container/25 text-error hover:bg-error-container/40',
				'danger-ghost': 'text-outline hover:bg-error-container/40 hover:text-error',
			},
			size: {
				xs: 'h-6 rounded-md px-2 text-label-sm',
				sm: 'h-7 rounded-lg px-2.5 text-label-sm',
				md: 'h-8 rounded-lg px-3 text-label-md',
				lg: 'h-10 rounded-2xl px-3.5 text-label-md',
				'icon-xs': 'size-6 rounded-md',
				'icon-sm': 'size-7 rounded-lg',
				icon: 'size-8 rounded-lg',
				'icon-lg': 'size-9 rounded-xl',
				'icon-xl': 'size-11 rounded-2xl',
			},
		},
		defaultVariants: {
			variant: 'ghost',
			size: 'md',
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
	export type ButtonShape = 'auto' | 'pill' | 'tile';

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** `pill` for chips, `tile` for large option cards. */
		shape?: ButtonShape;
		/** Stretch to the full width of the parent. */
		block?: boolean;
		/** Skip variant/size chrome but keep layout, focus and disabled handling. */
		bare?: boolean;
	};
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		variant = 'ghost',
		size = 'md',
		shape = 'auto',
		block = false,
		bare = false,
		ref = $bindable(),
		type = 'button',
		disabled = undefined,
		children,
		...restProps
	}: ButtonProps = $props();

	const shapeClass = $derived(
		shape === 'pill' ? 'rounded-full' : shape === 'tile' ? 'rounded-2xl' : ''
	);

	const classes = $derived(
		bare
			? cn(
					`${structural} border-0 bg-transparent p-0 text-inherit hover:bg-transparent`,
					className
				)
			: cn(buttonVariants({ variant, size }), block && 'w-full', shapeClass, className)
	);
</script>

<button
	bind:this={ref}
	data-slot="base-button"
	class={classes}
	{type}
	{disabled}
	{...restProps}
>
	{@render children?.()}
</button>
