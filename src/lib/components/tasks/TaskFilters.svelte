<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select';
	import {
		TASK_PRIORITIES,
		priorityMeta,
		dueFilterLabels,
		TASK_DUE_FILTERS,
		type TaskDueFilter,
		type TaskPriorityFilter
	} from '$lib/stores/tasks';

	let {
		priority,
		due,
		onchangepriority,
		onchangedue,
		onreset,
		dirty = false
	}: {
		priority: TaskPriorityFilter;
		due: TaskDueFilter;
		onchangepriority: (value: TaskPriorityFilter) => void;
		onchangedue: (value: TaskDueFilter) => void;
		onreset: () => void;
		dirty?: boolean;
	} = $props();

	const priorityItems: { value: TaskPriorityFilter; label: string }[] = [
		{ value: 'all', label: 'All priorities' },
		...TASK_PRIORITIES.map((value) => ({ value: value as TaskPriorityFilter, label: priorityMeta[value].label }))
	];

	const dueItems: { value: TaskDueFilter; label: string }[] = TASK_DUE_FILTERS.map((value) => ({
		value,
		label: dueFilterLabels[value]
	}));
</script>

<div class="flex flex-wrap items-center gap-2">
	<Select.Root
		type="single"
		value={priority}
		items={priorityItems}
		onValueChange={(value) => value && onchangepriority(value as TaskPriorityFilter)}
	>
		<Select.Trigger
			size="sm"
			aria-label="Filter by priority"
			class="glass-chip h-7 rounded-full border-0 px-3 text-label-md font-label text-on-surface shadow-none data-placeholder:text-outline focus-visible:ring-primary/40"
		>
			<Select.Value placeholder="All priorities" />
		</Select.Trigger>
		<Select.Content class="glass-solid">
			{#each priorityItems as item (item.value)}
				<Select.Item value={item.value} label={item.label} class="font-label text-label-md">
					{item.label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	<Select.Root
		type="single"
		value={due}
		items={dueItems}
		onValueChange={(value) => value && onchangedue(value as TaskDueFilter)}
	>
		<Select.Trigger
			size="sm"
			aria-label="Filter by due date"
			class="glass-chip h-7 rounded-full border-0 px-3 text-label-md font-label text-on-surface shadow-none data-placeholder:text-outline focus-visible:ring-primary/40"
		>
			<Select.Value placeholder="Any date" />
		</Select.Trigger>
		<Select.Content class="glass-solid">
			{#each dueItems as item (item.value)}
				<Select.Item value={item.value} label={item.label} class="font-label text-label-md">
					{item.label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>

	{#if dirty}
		<button
			type="button"
			class="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-label-md font-label text-outline transition-colors hover:text-on-surface"
			onclick={onreset}
		>
			<RotateCcw size={13} /> Reset
		</button>
	{/if}
</div>