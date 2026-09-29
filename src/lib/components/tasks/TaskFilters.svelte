<script lang="ts">
	import { RotateCcw } from '@lucide/svelte';
	import { Button, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		TASK_PRIORITIES,
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
		{ value: 'all', label: t('tasks.filters.allPriorities') },
		...TASK_PRIORITIES.map((value) => ({ value: value as TaskPriorityFilter, label: t('tasks.priorityLabel.' + value) }))
	];

	const dueItems: { value: TaskDueFilter; label: string }[] = TASK_DUE_FILTERS.map((value) => ({
		value,
		label: t('tasks.filters.due.' + value)
	}));
</script>

<div class="flex flex-wrap items-center gap-2">
	<Select
		variant="chip"
		size="sm"
		label={t('tasks.filters.byPriority')}
		placeholder={t('tasks.filters.allPriorities')}
		options={priorityItems}
		value={priority}
		onchange={(value) => value && onchangepriority(value as TaskPriorityFilter)}
	/>

	<Select
		variant="chip"
		size="sm"
		label={t('tasks.filters.byDue')}
		placeholder={t('tasks.filters.anyDate')}
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
			<RotateCcw size={13} /> {t('common.reset')}
		</Button>
	{/if}
</div>