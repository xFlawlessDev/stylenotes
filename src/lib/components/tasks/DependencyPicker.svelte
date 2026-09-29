<script lang="ts">
	import { Link2 } from '@lucide/svelte';
	import { Button, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { Task } from '$lib/stores/tasks';

	let { taskId, tasks, dependencies, onadd }: {
		taskId: string;
		tasks: Task[];
		dependencies: { taskId: string; dependsOnTaskId: string }[];
		onadd: (dependsOnTaskId: string) => void;
	} = $props();
	let selected = $state('');
	const options = $derived(tasks.filter((task) => task.id !== taskId && !dependencies.some((item) => item.taskId === taskId && item.dependsOnTaskId === task.id)).map((task) => ({ value: task.id, label: task.title })));
	function add() {
		if (!selected) return;
		onadd(selected);
		selected = '';
	}
</script>

{#if options.length}
	<div class="flex items-center gap-1.5">
		<Select bind:value={selected} options={options} label={t('tasks.dependencies.label')} placeholder={t('tasks.dependencies.placeholder')} size="sm" class="min-w-0 flex-1" />
		<Button size="icon" variant="secondary" aria-label={t('tasks.dependencies.add')} disabled={!selected} onclick={add}><Link2 size={14} /></Button>
	</div>
{/if}
