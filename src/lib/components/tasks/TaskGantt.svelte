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
		type Task
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
								<span class="block truncate text-code-sm font-code {statusMeta[taskStatus(task)].tone}">
									{statusMeta[taskStatus(task)].label}
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
										class="group absolute top-1/2 flex h-6 -translate-y-1/2 cursor-pointer items-center rounded-full px-2 text-code-sm font-code transition-transform hover:scale-[1.02] {taskStatus(
											task
										) === 'done'
											? 'bg-primary/70 text-on-primary'
											: isTaskOverdue(task)
												? 'bg-error/70 text-on-error'
												: 'bg-secondary/70 text-on-secondary'}"
										style="left: {bar.offset * DAY_WIDTH + 1}px; width: {bar.span * DAY_WIDTH - 2}px"
										title="{task.title} · {priorityMeta[taskPriority(task)].label} (double-click to open)"
										onclick={() => onselect(task.id)}
										ondblclick={() => onedit(task)}
									>
										<span class="truncate">{task.title}</span>
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