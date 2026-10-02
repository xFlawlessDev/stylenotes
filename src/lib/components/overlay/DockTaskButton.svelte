<script lang="ts">
	import { Archive, Circle, CircleCheck, CircleDashed, Eye } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { dockItemBar, type DockEdge } from '$lib/dock';
	import {
		taskPriority,
		taskStatus,
		type Task,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';

	let {
		task,
		edge,
		active,
		workspace = '',
		tone = '',
		onopen
	}: {
		task: Task;
		edge: DockEdge;
		active: boolean;
		/** Workspace label, shown only when the dock mixes workspaces. */
		workspace?: string;
		/** Workspace chip classes for the dot. */
		tone?: string;
		onopen: (task: Task) => void;
	} = $props();

	const statusIcons: Record<TaskStatus, typeof Circle> = {
		backlog: Archive,
		todo: Circle,
		doing: CircleDashed,
		review: Eye,
		done: CircleCheck
	};

	const priorityBar: Record<TaskPriority, string> = {
		low: 'bg-outline',
		medium: 'bg-secondary',
		high: 'bg-error'
	};

	const priorityText: Record<TaskPriority, string> = {
		low: 'text-on-surface-variant',
		medium: 'text-secondary',
		high: 'text-error'
	};

	const status = $derived(taskStatus(task));
	const priority = $derived(taskPriority(task));
	const Icon = $derived(statusIcons[status]);
	const bar = $derived(dockItemBar(edge, active));
	const label = $derived(
		t('over.openTask', { title: task.title }) + (workspace ? ` (${workspace})` : '')
	);
</script>

<!-- The hover card beside the rail already previews the task; no tooltip. -->
<Button
	data-dock-id={task.id}
	data-dock-kind="task"
	variant="secondary"
	size="icon-lg"
	class="group relative shrink-0 {active ? 'scale-105 ring-1 ring-inset ring-primary/60' : 'hover:scale-105'}"
	aria-label={label}
	ondblclick={() => onopen(task)}
	onclick={(event) => {
		// Keyboard and assistive tech report detail 0; pointer clicks wait for
		// the second click so a stray click cannot open a window.
		if (event.detail === 0) onopen(task);
	}}
>
	<Icon size={19} class={priorityText[priority]} />
	<span class="{bar} {priorityBar[priority]}"></span>
	{#if workspace}
		<span
			class="absolute top-0.5 left-0.5 size-1.5 rounded-full border border-surface {tone}"
			aria-hidden="true"
		></span>
	{/if}
</Button>
