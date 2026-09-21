<script lang="ts">
	import { CalendarRange } from '@lucide/svelte';
	import {
		addDays,
		diffDays,
		formatTimelineDay,
		formatTimelineMonth,
		isTaskOverdue,
		priorityMeta,
		taskBar,
		taskPriority,
		timelineRange,
		statusMeta,
		taskStatus,
		type Task,
		type TaskStatus
	} from '$lib/stores/tasks';

	let {
		tasks,
		selectedId,
		onselect,
		onedit
	}: {
		tasks: Task[];
		selectedId: string;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
	} = $props();

	const DAY_WIDTH = 30;

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
	const width = $derived(range.days * DAY_WIDTH);
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
	{#if rows.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
			<div class="glass-well flex size-11 items-center justify-center rounded-2xl text-outline">
				<CalendarRange size={20} />
			</div>
			<p class="text-body-sm font-body text-outline">
				Add start or due dates to see tasks on the timeline.
			</p>
		</div>
	{:else}
		<div class="glass-panel min-h-0 flex-1 overflow-hidden rounded-2xl">
			<div class="scrollbar-none h-full overflow-auto">
				<div style="width: {width + 160}px" class="min-w-full">
					<!-- Header -->
					<div class="sticky top-0 z-20 flex border-b border-hairline bg-surface-container/80 backdrop-blur">
						<div
							class="sticky left-0 z-30 w-[160px] shrink-0 border-r border-hairline bg-surface-container/80 px-3 py-2 text-label-sm font-label tracking-wider text-outline uppercase backdrop-blur sm:w-[220px]"
						>
							Task
						</div>
						<div class="flex" style="width: {width}px">
							{#each days as day, index (index)}
								{#if index === 0 || day.getDate() === 1}
									<div
										class="border-l border-hairline px-1 py-2 text-label-sm font-label text-outline"
										style="width: {DAY_WIDTH * 1}px"
									>
										{formatTimelineMonth(day)}
									</div>
								{:else}
									<div
										class="flex items-center justify-center py-2 text-code-sm font-code text-outline/70"
										style="width: {DAY_WIDTH}px"
									>
										{formatTimelineDay(day)}
									</div>
								{/if}
							{/each}
						</div>
					</div>

					<!-- Rows -->
					{#each rows as task (task.id)}
						{@const bar = taskBar(task, range)}
						{@const status = taskStatus(task)}
						{@const overdue = isTaskOverdue(task)}
						<div class="flex border-b border-hairline/60 last:border-b-0">
							<button
								type="button"
								class="sticky left-0 z-10 w-[160px] shrink-0 cursor-pointer border-r border-hairline bg-surface/90 px-3 py-2 text-left backdrop-blur transition-colors hover:bg-surface-container/50 sm:w-[220px] {selectedId ===
								task.id
									? 'glass-chip'
									: ''}"
								onclick={() => onselect(task.id)}
								ondblclick={() => onedit(task)}
							>
								<span class="block truncate text-body-sm font-body text-on-surface">{task.title}</span>
								<span class="block truncate text-code-sm font-code {statusMeta[status].tone}">
									{statusMeta[status].label}{#if overdue}<span class="text-error"> · Overdue</span>{/if}
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
											style="width: {DAY_WIDTH}px"
										></div>
									{/each}
								</div>

								{#if todayIndex >= 0 && todayIndex < range.days}
									<div
										class="absolute top-0 bottom-0 w-px bg-primary/70"
										style="left: {todayIndex * DAY_WIDTH + DAY_WIDTH / 2}px"
									></div>
								{/if}

								{#if bar}
									<button
										type="button"
										class="{BAR_BASE} {BAR_STYLES[status]} {overdue ? OVERDUE_BAR : ''}"
										style="left: {bar.offset * DAY_WIDTH + 1}px; width: {bar.span * DAY_WIDTH - 2}px"
										title="{task.title} · {statusMeta[status].label} · {priorityMeta[taskPriority(task)]
											.label}{overdue ? ' · Overdue' : ''} (double-click to open)"
										aria-label="{task.title}, {statusMeta[status].label}{overdue
											? ', overdue'
											: ''}"
										onclick={() => onselect(task.id)}
										ondblclick={() => onedit(task)}
									>
										<span class="truncate {status === 'done' ? 'line-through' : ''}">{task.title}</span>
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</section>