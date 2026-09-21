<script lang="ts">
	import { Circle, CircleCheck, CircleDashed, Eye } from '@lucide/svelte';
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
		onopen
	}: {
		task: Task;
		edge: DockEdge;
		active: boolean;
		onopen: (task: Task) => void;
	} = $props();

	const statusIcons: Record<TaskStatus, typeof Circle> = {
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
</script>

<!-- No tooltip here: the hover card next to the rail already shows the task. -->
<button
	data-dock-id={task.id}
	data-dock-kind="task"
	class="glass-chip group relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all {active
		? 'scale-105 ring-1 ring-inset ring-primary/60'
		: 'hover:scale-105 hover:text-on-surface'}"
	aria-label="{task.title} — double-click to open task window"
	ondblclick={() => onopen(task)}
	onclick={(event) => {
		// Keyboard and assistive tech report detail 0; pointer clicks wait for
		// the second click so a stray click cannot open a window.
		if (event.detail === 0) onopen(task);
	}}
>
	<Icon size={19} class={priorityText[priority]} />
	<span class="{bar} {priorityBar[priority]}"></span>
</button>
