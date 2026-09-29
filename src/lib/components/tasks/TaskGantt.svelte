<script lang="ts">
	import { Calendar, CalendarDays, CalendarRange } from '@lucide/svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Button, EmptyState, SegmentedControl } from '$lib/components/base';
	import TaskGanttHeader from '$lib/components/tasks/TaskGanttHeader.svelte';
	import GanttTaskLabelCell from '$lib/components/tasks/GanttTaskLabelCell.svelte';
	import GanttTaskTooltip from '$lib/components/tasks/GanttTaskTooltip.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		GANTT_ROW_HEIGHT,
		ganttDependencyLinks,
		ganttLinksForTask,
		ganttMonthGroups,
		ganttScaleDayWidth,
		ganttTimelineColumns,
		ganttYearGroups,
		type GanttTimelineScale
	} from '$lib/stores/task-gantt';
	import {
		diffDays,
		isTaskOverdue,
		taskBar,
		taskBlockers,
		timelineRange,
		taskStatus,
		type Task,
		type TaskDependency,
		type TaskStatus
	} from '$lib/stores/tasks';

	let {
		tasks,
		allTasks = [],
		dependencies = [],
		selectedId,
		onselect,
		onedit
	}: {
		tasks: Task[];
		/** Unfiltered workspace tasks, so blocked status stays correct when a filter hides a blocker. */
		allTasks?: Task[];
		dependencies?: TaskDependency[];
		selectedId: string;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
	} = $props();

	const ROW_HEIGHT = GANTT_ROW_HEIGHT;
	const uid = $props.id();

	// The day columns shrink or grow with the panel so the timeline stays inside
	// the window; only when the minimum readable width is reached does the panel
	// scroll horizontally.
	let panelWidth = $state(0);
	let labelWidth = $state(0);
	let scale = $state<GanttTimelineScale>('date');

	const scales: { id: GanttTimelineScale; label: string; icon: typeof Calendar }[] = [
		{ id: 'date', label: t('tasks.gantt.scale.date'), icon: CalendarDays },
		{ id: 'week', label: t('tasks.gantt.scale.week'), icon: CalendarRange },
		{ id: 'month', label: t('tasks.gantt.scale.month'), icon: Calendar }
	];

	const BAR_BASE =
		'group absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center px-2 text-code-sm font-code transition-all hover:scale-[1.02]';

	// Each status gets its own colour + silhouette so the timeline is scannable at a glance:
	// hollow dashed = planned, solid pill = active, tinted outline = under review, muted short bar = done.
	const BAR_STYLES: Record<TaskStatus, string> = {
		todo: 'h-5 rounded-lg border border-dashed border-outline/60 bg-surface-container/25 text-on-surface-variant hover:bg-surface-container/60',
		doing: 'h-6 rounded-full bg-secondary/80 text-on-secondary shadow-sm hover:bg-secondary',
		review: 'h-6 rounded-lg border border-tertiary/60 bg-tertiary/25 text-tertiary hover:bg-tertiary/35',
		done: 'h-5 rounded-lg bg-primary/60 text-on-primary hover:bg-primary/75'
	};

	const OVERDUE_BAR = 'ring-2 ring-error/70';

	const range = $derived(timelineRange(tasks, { padding: 2, minDays: 21 }));
	const rows = $derived(
		tasks.filter((task) => taskBar(task, range) !== null).sort((a, b) => {
			const aStart = a.startAt ?? a.dueAt ?? '';
			const bStart = b.startAt ?? b.dueAt ?? '';
			return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
		})
	);
	const todayIndex = $derived(diffDays(new Date(), range.start));
	const columns = $derived(ganttTimelineColumns(range, scale));
	const monthGroups = $derived(ganttMonthGroups(range));
	const yearGroups = $derived(ganttYearGroups(range));
	// The top strip names the enclosing period; the month scale names the year
	// because the cells below already carry the month name.
	const stripGroups = $derived(scale === 'month' ? yearGroups : monthGroups);
	// Bars are positioned by day offsets, so pixel-per-day stays uniform; the scale
	// only changes how tightly a day is compressed and how the header is bucketed.
	const dayWidth = $derived(
		ganttScaleDayWidth(scale, range.days, panelWidth && labelWidth ? panelWidth - labelWidth : Number.NaN)
	);
	const width = $derived(range.days * dayWidth);
	const statusTasks = $derived(allTasks.length ? allTasks : tasks);
	const links = $derived(ganttDependencyLinks(rows, range, dependencies, { dayWidth }));
	const selectedLinks = $derived(ganttLinksForTask(links, selectedId));
</script>

<section
	class="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-hidden [--gantt-label:140px] sm:[--gantt-label:180px] lg:[--gantt-label:220px]"
>
	{#if rows.length === 0}
		<EmptyState
			icon={CalendarRange}
			title={t('tasks.gantt.empty')}
		/>
	{:else}
		<div class="flex shrink-0 flex-wrap items-center justify-between gap-3">
			<SegmentedControl
				bind:value={scale}
				items={scales}
				ariaLabel={t('tasks.gantt.scaleLabel')}
				class="w-auto"
				itemClass="flex-none"
			/>
			{#if links.length}
				<div class="flex flex-wrap items-center gap-3 text-code-sm font-code text-outline">
					<span class="flex items-center gap-1.5">
						<svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true"
							><path
								d="M0 3 H24"
								fill="none"
								stroke="var(--color-error)"
								stroke-width="1.6"
								stroke-dasharray="4 3"
							/></svg
						>
						{t('tasks.gantt.waitingOnDependency')}
					</span>
					<span class="flex items-center gap-1.5">
						<svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true"
							><path d="M0 3 H24" fill="none" stroke="var(--color-outline)" stroke-width="1.6" /></svg
						>
						{t('tasks.gantt.dependencyMet')}
					</span>
				</div>
			{/if}
		</div>

		<div class="glass-panel min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-2xl">
			<div class="scrollbar-none h-full w-full overflow-auto" bind:clientWidth={panelWidth}>
				<div style="width: calc(var(--gantt-label) + {width}px)" class="min-w-full">
					<TaskGanttHeader {columns} {stripGroups} {dayWidth} {width} bind:labelWidth />

					<div class="relative">
						<!-- Dependency connections, painted behind the bars and grid overlays. -->
						<svg
							class="pointer-events-none absolute top-0"
							style="left: var(--gantt-label); width: {width}px; height: {rows.length *
								ROW_HEIGHT}px"
							aria-hidden="true"
						>
							<defs>
								<marker
									id="gantt-arrow-open-{uid}"
									viewBox="0 0 6 6"
									refX="5.6"
									refY="3"
									markerWidth="6"
									markerHeight="6"
									orient="auto"
								>
									<path d="M0 0 L6 3 L0 6 Z" fill="var(--color-error)" />
								</marker>
								<marker
									id="gantt-arrow-met-{uid}"
									viewBox="0 0 6 6"
									refX="5.6"
									refY="3"
									markerWidth="6"
									markerHeight="6"
									orient="auto"
								>
									<path d="M0 0 L6 3 L0 6 Z" fill="var(--color-outline)" />
								</marker>
							</defs>
							{#each links as link (link.id)}
								{@const emphasized = selectedLinks.has(link.id)}
								<path
									d={link.path}
									fill="none"
									stroke={link.open ? 'var(--color-error)' : 'var(--color-outline)'}
									stroke-width={emphasized ? 2 : 1.4}
									stroke-opacity={emphasized ? 0.95 : 0.55}
									stroke-dasharray={link.open ? '5 4' : undefined}
									marker-end="url(#gantt-arrow-{link.open ? 'open' : 'met'}-{uid})"
								/>
							{/each}
						</svg>

						<!-- Rows -->
						{#each rows as task (task.id)}
							{@const bar = taskBar(task, range)}
							{@const status = taskStatus(task)}
							{@const overdue = isTaskOverdue(task)}
							{@const blockers = task.completed
								? []
								: taskBlockers(task.id, statusTasks, dependencies).filter(
										(item) => !item.completed
									)}
							<div class="flex border-b border-hairline/60 last:border-b-0" style="height: {ROW_HEIGHT}px">
								<GanttTaskLabelCell
									{task}
									rowHeight={ROW_HEIGHT}
									selected={selectedId === task.id}
									{overdue}
									{blockers}
									{onselect}
									{onedit}
								/>

								<div class="relative" style="width: {width}px">
									<!-- Column grid: a separator at each column boundary, weekend shading on the date scale. -->
									<div class="absolute inset-0 flex overflow-hidden">
										{#each columns as column (column.id)}
											<div
												class="h-full border-l border-hairline/40"
												style="width: {column.span * dayWidth}px"
											></div>
										{/each}
									</div>
									{#if scale === 'date'}
										<div class="pointer-events-none absolute inset-0">
											{#each columns as column (column.id)}
												{#if column.weekendStart}
													<div
														class="absolute top-0 bottom-0 bg-surface-container/30"
														style="left: {column.offset * dayWidth}px; width: {2 * dayWidth}px"
													></div>
												{/if}
											{/each}
										</div>
									{/if}

									{#if todayIndex >= 0 && todayIndex < range.days}
										<div
											class="absolute top-0 bottom-0 z-10 w-px bg-primary/70"
											style="left: {todayIndex * dayWidth + dayWidth / 2}px"
										></div>
									{/if}

									{#if bar}
										{@const barWidth = bar.span * dayWidth - 2}
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														bare
														class="{BAR_BASE} justify-start {BAR_STYLES[status]} {overdue ? OVERDUE_BAR : ''}"
														style="left: {bar.offset * dayWidth + 1}px; width: {barWidth}px"
														aria-label="{task.title}, {t('tasks.statusLabel.' + status)}{overdue
															? ', ' + t('tasks.gantt.overdue')
															: ''}"
														onclick={() => onselect(task.id)}
														ondblclick={() => onedit(task)}
													>
														{#if barWidth >= 36}
															<span class="truncate {status === 'done' ? 'line-through' : ''}"
																>{task.title}</span
															>
														{/if}
													</Button>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content>
												<GanttTaskTooltip {task} {overdue} {blockers} />
											</Tooltip.Content>
										</Tooltip.Root>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
</section>
