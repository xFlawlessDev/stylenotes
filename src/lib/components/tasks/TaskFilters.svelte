<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import { Button, Select } from '$lib/components/base';
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
	<Select
		variant="chip"
		size="sm"
		label="Filter by priority"
		placeholder="All priorities"
		options={priorityItems}
		value={priority}
		onchange={(value) => value && onchangepriority(value as TaskPriorityFilter)}
	/>

	<Select
		variant="chip"
		size="sm"
		label="Filter by due date"
		placeholder="Any date"
		options={dueItems}
		value={due}
		onchange={(value) => value && onchangedue(value as TaskDueFilter)}
	/>

	{#if dirty}
		<Button
			size="sm"
			shape="pill"
			class="gap-1.5 px-2.5 text-outline"
			onclick={onreset}
		>
			<RotateCcw size={13} /> Reset
		</Button>
	{/if}
</div>