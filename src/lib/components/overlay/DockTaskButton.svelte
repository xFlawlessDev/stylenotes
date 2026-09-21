<script lang="ts">
	import { Circle, CircleCheck, CircleDashed, Eye } from '@lucide/svelte';
	import type { DockEdge } from '$lib/dock';
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
		active
	}: {
		task: Task;
		edge: DockEdge;
		active: boolean;
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
	const bar = $derived(barClasses(edge, active));

	/** Priority indicator on the edge the dock faces. */
	function barClasses(position: DockEdge, isActive: boolean) {
		if (position === 'top') {
			return `absolute bottom-0 rounded-t ${isActive ? 'left-0.5 h-1.5 w-8' : 'left-1 h-1 w-7'}`;
		}
		const side = position === 'right' ? 'right-0 rounded-l' : 'left-0 rounded-r';
		return `absolute ${side} ${isActive ? 'top-0.5 h-8 w-1.5' : 'top-1 h-7 w-1'}`;
	}
</script>

<!-- No tooltip here: the hover card next to the rail already shows the task. -->
<button
	data-task-id={task.id}
	class="glass-chip group relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-all {active
		? 'scale-105 ring-1 ring-inset ring-primary/60'
		: 'hover:scale-105 hover:text-on-surface'}"
	aria-label={task.title}
>
	<Icon size={19} class={priorityText[priority]} />
	<span class="{bar} {priorityBar[priority]}"></span>
</button>
