<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	export type SelectOption = { value: string; label: string };

	let {
		value = $bindable(''),
		options,
		placeholder,
		label,
		disabled = false,
		size = 'default',
		class: className,
		onchange
	}: {
		value?: string;
		options: SelectOption[];
		placeholder?: string;
		label?: string;
		disabled?: boolean;
		size?: 'sm' | 'default';
		class?: string;
		onchange?: (value: string) => void;
	} = $props();

	function change(next: string) {
		if (next === undefined || next === null) return;
		value = next;
		onchange?.(next);
	}
</script>

<Select.Root
	type="single"
	{disabled}
	value={value}
	items={options}
	onValueChange={(next) => change(next)}
>
	<Select.Trigger
		{size}
		aria-label={label}
		class="glass-well w-full border-0 px-3 text-body-md font-body text-on-surface shadow-none data-placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50 {className ??
			''}"
	>
		<Select.Value {placeholder} />
	</Select.Trigger>
	<Select.Content class="glass-solid">
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} class="font-body text-body-md">
				{option.label}
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>