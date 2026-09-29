<script lang="ts">
	import { t } from '$lib/i18n/index.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import GanttTaskTooltip from '$lib/components/tasks/GanttTaskTooltip.svelte';
	import { statusMeta, taskStatus, type Task } from '$lib/stores/tasks';

	let {
		task,
		rowHeight,
		selected = false,
		overdue = false,
		blockers = [],
		onselect,
		onedit
	}: {
		task: Task;
		/** Height of the row, so the sticky cell matches the timeline grid. */
		rowHeight: number;
		selected?: boolean;
		overdue?: boolean;
		/** Open blockers that still gate this task. */
		blockers?: Task[];
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
	} = $props();

	const status = $derived(taskStatus(task));
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- Styled as a table-style cell with stacked block content. -->
			<button
				{...props}
				type="button"
				class="sticky left-0 z-10 w-[var(--gantt-label)] shrink-0 cursor-pointer border-r border-hairline bg-surface/90 px-3 py-2 text-left backdrop-blur transition-colors hover:bg-surface-container/50 {selected
					? 'glass-chip'
					: ''}"
				style="height: {rowHeight}px"
				onclick={() => onselect(task.id)}
				ondblclick={() => onedit(task)}
			>
				<span class="block truncate text-body-sm font-body text-on-surface">{task.title}</span>
				<span class="block truncate text-code-sm font-code {statusMeta[status].tone}">
					{t('tasks.statusLabel.' + status)}{#if overdue}<span class="text-error"> · {t('tasks.gantt.overdue')}</span>{/if}{#if blockers.length}<span
							class="text-error"
						>
							· {t('tasks.gantt.blockedByCount', { count: blockers.length })}</span
						>{/if}
				</span>
			</button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="right">
		<GanttTaskTooltip {task} {overdue} {blockers} />
	</Tooltip.Content>
</Tooltip.Root>
