<script lang="ts">
	import { CalendarRange } from '@lucide/svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import { GANTT_ROW_HEIGHT, ganttDayWidth, ganttDependencyLinks, ganttLinksForTask } from '$lib/stores/task-gantt';
	import {
		addDays,
		diffDays,
		formatTimelineDay,
		formatTimelineMonth,
		isTaskOverdue,
		priorityMeta,
		taskBar,
		taskBlockers,
		taskPriority,
		timelineRange,
		statusMeta,
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
	const days = $derived(
		Array.from({ length: range.days }, (_, index) => addDays(range.start, index))
	);
	const rows = $derived(
		tasks.filter((task) => taskBar(task, range) !== null).sort((a, b) => {
			const aStart = a.startAt ?? a.dueAt ?? '';
			const bStart = b.startAt ?? b.dueAt ?? '';
			return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
		})
	);
	const todayIndex = $derived(diffDays(new Date(), range.start));
	const dayWidth = $derived(
		ganttDayWidth(panelWidth && labelWidth ? panelWidth - labelWidth : Number.NaN, range.days)
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
			title="Add start or due dates to see tasks on the timeline."
		/>
	{:else}
		{#if links.length}
			<div class="flex shrink-0 flex-wrap items-center justify-end gap-3 text-code-sm font-code text-outline">
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
					Waiting on dependency
				</span>
				<span class="flex items-center gap-1.5">
					<svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true"
						><path d="M0 3 H24" fill="none" stroke="var(--color-outline)" stroke-width="1.6" /></svg
					>
					Dependency met
				</span>
			</div>
		{/if}

		<div class="glass-panel min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-2xl">
			<div class="scrollbar-none h-full w-full overflow-auto" bind:clientWidth={panelWidth}>
				<div style="width: calc(var(--gantt-label) + {width}px)" class="min-w-full">
					<!-- Header -->
					<div class="sticky top-0 z-20 flex border-b border-hairline bg-surface-container/80 backdrop-blur">
						<div
							bind:offsetWidth={labelWidth}
							class="sticky left-0 z-30 w-[var(--gantt-label)] shrink-0 border-r border-hairline bg-surface-container/80 px-3 py-2 text-label-sm font-label tracking-wider text-outline uppercase backdrop-blur"
						>
							Task
						</div>
						<div class="flex" style="width: {width}px">
							{#each days as day, index (index)}
								{#if index === 0 || day.getDate() === 1}
									<div
										class="border-l border-hairline px-1 py-2 text-label-sm font-label text-outline"
										style="width: {dayWidth}px"
									>
										{formatTimelineMonth(day)}
									</div>
								{:else}
									<div
										class="flex items-center justify-center py-2 text-code-sm font-code text-outline/70"
										style="width: {dayWidth}px"
									>
										{formatTimelineDay(day)}
									</div>
								{/if}
							{/each}
						</div>
					</div>

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
								<!-- Native button: this is a table-style cell with stacked block content. -->
								<button
									type="button"
									class="sticky left-0 z-10 w-[var(--gantt-label)] shrink-0 cursor-pointer border-r border-hairline bg-surface/90 px-3 py-2 text-left backdrop-blur transition-colors hover:bg-surface-container/50 {selectedId ===
									task.id
										? 'glass-chip'
										: ''}"
									title="{task.title}{blockers.length
										? ` · Blocked by ${blockers.map((item) => item.title).join(', ')}`
										: ''}"
									onclick={() => onselect(task.id)}
									ondblclick={() => onedit(task)}
								>
									<span class="block truncate text-body-sm font-body text-on-surface">{task.title}</span>
									<span class="block truncate text-code-sm font-code {statusMeta[status].tone}">
										{statusMeta[status].label}{#if overdue}<span class="text-error"> · Overdue</span>{/if}{#if blockers.length}<span
												class="text-error"
											>
												· Blocked by {blockers.length}</span
											>{/if}
									</span>
								</button>

								<div class="relative" style="width: {width}px">
									<!-- Grid lines -->
									<div class="absolute inset-0 flex">
										{#each days as day, index (index)}
											<div
												class="h-full border-l border-hairline/40 {day.getDay() === 0 ||
												day.getDay() === 6
													? 'bg-surface-container/30'
													: ''}"
												style="width: {dayWidth}px"
											></div>
										{/each}
									</div>

									{#if todayIndex >= 0 && todayIndex < range.days}
										<div
											class="absolute top-0 bottom-0 w-px bg-primary/70"
											style="left: {todayIndex * dayWidth + dayWidth / 2}px"
										></div>
									{/if}

									{#if bar}
										<Button
											bare
											class="{BAR_BASE} justify-start {BAR_STYLES[status]} {overdue ? OVERDUE_BAR : ''}"
											style="left: {bar.offset * dayWidth + 1}px; width: {bar.span * dayWidth - 2}px"
											title="{task.title} · {statusMeta[status].label} · {priorityMeta[taskPriority(task)]
												.label}{overdue ? ' · Overdue' : ''} (double-click to open)"
											aria-label="{task.title}, {statusMeta[status].label}{overdue
												? ', overdue'
												: ''}"
											onclick={() => onselect(task.id)}
											ondblclick={() => onedit(task)}
										>
											<span class="truncate {status === 'done' ? 'line-through' : ''}">{task.title}</span>
										</Button>
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
