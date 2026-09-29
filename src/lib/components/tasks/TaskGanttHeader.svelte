<script lang="ts">
	import type { GanttStripGroup, GanttTimelineColumn } from '$lib/stores/task-gantt';
	import { t } from '$lib/i18n/index.svelte';

	let {
		columns,
		stripGroups,
		dayWidth,
		width,
		labelWidth = $bindable(0)
	}: {
		/** Unit columns: day numbers, ISO week numbers, or month names. */
		columns: GanttTimelineColumn[];
		/** Period cells above the units: one per month, or per year on the month scale. */
		stripGroups: GanttStripGroup[];
		/** Pixel width of a single day. */
		dayWidth: number;
		/** Total pixel width of the timeline track. */
		width: number;
		/** Measured width of the sticky task-label column, reported back to the parent. */
		labelWidth?: number;
	} = $props();

	// A cell only shows its label once it is wide enough to read.
	const MIN_CELL_LABEL = 18;
</script>

<div class="sticky top-0 z-20 flex border-b border-hairline bg-surface-container/80 backdrop-blur">
	<div
		bind:offsetWidth={labelWidth}
		class="sticky left-0 z-30 flex w-[var(--gantt-label)] shrink-0 items-center border-r border-hairline bg-surface-container/80 px-3 text-label-sm font-label tracking-wider text-outline uppercase backdrop-blur"
	>
		{t('tasks.gantt.taskColumn')}
	</div>
	<div class="flex flex-col" style="width: {width}px">
		<!-- Period strip: one cell per month (or year on the month scale). -->
		<div class="flex border-b border-hairline/60">
			{#each stripGroups as group (group.id)}
				<div
					class="truncate border-l border-hairline/60 px-1 py-1 text-label-sm font-label text-outline"
					style="width: {group.span * dayWidth}px"
					title={group.label}
				>
					{group.label}
				</div>
			{/each}
		</div>
		<!-- Unit strip: day numbers, ISO week numbers, or month names. -->
		<div class="flex">
			{#each columns as column (column.id)}
				{@const cellWidth = column.span * dayWidth}
				<div
					class="flex items-center justify-center truncate border-l border-hairline/40 py-1.5 font-code text-code-sm text-outline/70"
					style="width: {cellWidth}px"
					title={column.title}
				>
					{#if cellWidth >= MIN_CELL_LABEL}
						{column.label}
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
