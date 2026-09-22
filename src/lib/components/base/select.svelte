<script lang="ts" module>
	import { type VariantProps, tv } from './variants.js';

	export const selectTriggerVariants = tv({
		base: 'justify-between shadow-none outline-none',
		variants: {
			size: {
				sm: 'h-7 text-body-sm',
				md: 'h-8 text-body-md',
				lg: 'h-9! rounded-xl text-body-md',
			},
			variant: {
				/** Glass well – default form select. */
				well: 'glass-well w-full border-0 px-3 font-body text-on-surface focus-visible:ring-1 focus-visible:ring-primary/50 data-placeholder:text-outline',
				/** Pill chip – filter bars. */
				chip: 'glass-chip w-fit border-0 rounded-full px-3 font-label text-label-md text-on-surface focus-visible:ring-1 focus-visible:ring-primary/40 data-placeholder:text-outline',
			},
		},
		defaultVariants: {
			variant: 'well',
			size: 'md',
		},
	});

	export type SelectSize = VariantProps<typeof selectTriggerVariants>['size'];
	export type SelectVariant = VariantProps<typeof selectTriggerVariants>['variant'];

	export type SelectOption = { value: string; label: string };
</script>

<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(''),
		options,
		placeholder,
		label,
		disabled = false,
		size = 'md',
		variant = 'well',
		contentClass,
		class: className,
		onchange
	}: {
		value?: string;
		options: SelectOption[];
		placeholder?: string;
		/** Accessible name; not rendered. Wrap the select in a `Field` for that. */
		label?: string;
		disabled?: boolean;
		size?: SelectSize;
		variant?: SelectVariant;
		contentClass?: string;
		class?: string;
		onchange?: (value: string) => void;
	} = $props();

	const triggerSize = $derived(size === 'sm' ? 'sm' : 'default');
	const itemClass = $derived(
		variant === 'chip' ? 'font-label text-label-md' : 'font-body text-body-md'
	);
	/**
	 * bits-ui treats `''` as "nothing selected", so a real option with an empty
	 * value would leave the trigger blank. Fall back to that option's label.
	 */
	const emptyLabel = $derived(placeholder ?? options.find((option) => option.value === value)?.label);

	function change(next: string) {
		if (next === undefined || next === null) return;
		value = next;
		onchange?.(next);
	}
</script>

<Select.Root
	type="single"
	{disabled}
	{value}
	items={options}
	onValueChange={(next) => change(next)}
>
	<Select.Trigger
		size={triggerSize}
		aria-label={label}
		class={cn(selectTriggerVariants({ variant, size }), className)}
	>
		<Select.Value placeholder={emptyLabel} />
	</Select.Trigger>
	<Select.Content class={cn('glass-solid', contentClass)}>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} class={itemClass}>
				{option.label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
