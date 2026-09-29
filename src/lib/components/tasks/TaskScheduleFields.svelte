<script lang="ts">
	import { Field, Input } from '$lib/components/base';

	let {
		startDate = $bindable(''),
		dueDate = $bindable(''),
		compact = false,
		inputSize = 'lg',
		group = '',
		labelClass = '',
		idPrefix = 'task'
	}: {
		startDate?: string;
		dueDate?: string;
		compact?: boolean;
		inputSize?: 'sm' | 'md' | 'lg' | 'none';
		group?: string;
		labelClass?: string;
		idPrefix?: string;
	} = $props();

	function shortDate(value: string): boolean {
		return !!value && value.length === 10;
	}

	const dateError = $derived(shortDate(startDate) && shortDate(dueDate) && dueDate < startDate);
	const inputClass = $derived(compact ? 'text-body-sm' : '');
	const grid = $derived(compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3');
</script>

<div class="flex flex-col gap-1.5">
	<div class={grid}>
		<Field label="Start" for="{idPrefix}-start" class={group} {labelClass}>
			<Input
				id="{idPrefix}-start"
				type="date"
				size={inputSize}
				class={inputClass}
				bind:value={startDate}
			/>
		</Field>

		<Field label="Due" for="{idPrefix}-due" class={group} {labelClass}>
			<Input
				id="{idPrefix}-due"
				type="date"
				size={inputSize}
				class={inputClass}
				bind:value={dueDate}
			/>
		</Field>
	</div>

	{#if dateError}
		<p class="text-label-sm font-label text-error">The due date cannot precede the start date.</p>
	{/if}
</div>
