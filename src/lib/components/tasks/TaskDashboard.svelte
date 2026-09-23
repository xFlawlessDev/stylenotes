<script lang="ts">
	import {
		CalendarDays,
		ChevronLeft,
		ChevronRight,
		Inbox,
		Sun
	} from '@lucide/svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import TaskCard from '$lib/components/tasks/TaskCard.svelte';
	import {
		INCOMPLETE_TASK_VIEWS,
		incompleteTasksForView,
		localDateKey,
		taskMatchesDate,
		monthCalendarDays,
		tasksForDate,
		upcomingHolidays,
		type IncompleteTaskView
	} from '$lib/stores/task-dashboard';
	import { sortTasks, type Task } from '$lib/stores/tasks';

	let { tasks, selectedId, onselect, onedit }: {
		tasks: Task[];
		selectedId: string;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
	} = $props();

	const today = new Date();
	let selectedDate = $state(new Date(today));
	let visibleMonth = $state(new Date(today.getFullYear(), today.getMonth(), 1));
	let incompleteView = $state<IncompleteTaskView>('today');
	const calendarDays = $derived(monthCalendarDays(visibleMonth));
	const selectedDayTasks = $derived(sortTasks(tasksForDate(tasks, selectedDate)));
	const incompleteTasks = $derived(incompleteTasksForView(tasks, incompleteView));
	const holidays = $derived(upcomingHolidays(undefined, today));
	const monthLabel = $derived(
		new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(visibleMonth)
	);
	const selectedDateLabel = $derived(
		new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDate)
	);

	function changeMonth(offset: number) {
		visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
	}

	function selectDay(date: Date) {
		selectedDate = new Date(date);
		visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
	}

	function returnToToday() {
		selectDay(today);
	}

	function holidayDate(date: Date): string {
		return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date);
	}
</script>

<div
	class="scrollbar-none flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5"
>
	<div
		class="grid min-w-0 shrink-0 gap-3 xl:min-h-[12rem] xl:grid-rows-[minmax(0,1fr)] xl:shrink xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]"
	>
		<section
			class="glass-panel scrollbar-none flex max-h-[min(56vh,36rem)] min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl p-2.5 sm:p-3"
			aria-labelledby="mini-calendar-heading"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 id="mini-calendar-heading" class="text-title-sm font-title text-on-surface">Mini Calendar</h2>
				<div class="flex min-w-0 flex-wrap items-center gap-1">
					{#if localDateKey(selectedDate) !== localDateKey(today)}
						<Button variant="secondary" size="md" class="min-h-11" onclick={returnToToday}>Today</Button>
					{/if}
					<Button variant="ghost" size="icon-lg" aria-label="Previous month" onclick={() => changeMonth(-1)}>
						<ChevronLeft size={16} />
					</Button>
					<span class="min-w-[100px] text-center text-label-md font-label text-on-surface sm:min-w-[118px]">{monthLabel}</span>
					<Button variant="ghost" size="icon-lg" aria-label="Next month" onclick={() => changeMonth(1)}>
						<ChevronRight size={16} />
					</Button>
				</div>
			</div>

			<div class="grid grid-cols-7 gap-0.5 text-center sm:gap-1" aria-label={monthLabel}>
				{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as weekday (weekday)}
					<span class="py-1 text-code-sm font-code text-outline">{weekday}</span>
				{/each}
				{#each calendarDays as date (localDateKey(date))}
					{@const key = localDateKey(date)}
					{@const inMonth = date.getMonth() === visibleMonth.getMonth()}
					{@const isToday = key === localDateKey(today)}
					{@const isSelected = key === localDateKey(selectedDate)}
					{@const hasTasks = tasks.some((task) => !task.completed && taskMatchesDate(task, date))}
					<Button
						variant={isSelected ? 'secondary' : 'ghost'}
						size="sm"
						class="relative mx-auto h-10 w-full max-w-11 min-w-0 p-0 text-label-sm sm:h-11 {inMonth ? 'text-on-surface' : 'text-outline/50'} {isToday && !isSelected ? 'ring-1 ring-primary/60' : ''}"
						aria-label={new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(date)}
						aria-pressed={isSelected}
						onclick={() => selectDay(date)}
					>
						{date.getDate()}
						{#if hasTasks}<span class="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden="true"></span>{/if}
					</Button>
				{/each}
			</div>

			<div class="glass-divider h-px"></div>
			<section class="flex flex-col gap-2" aria-labelledby="upcoming-holidays-heading">
				<div class="flex items-center gap-2">
					<Sun size={15} class="text-tertiary" />
					<h3 id="upcoming-holidays-heading" class="text-label-md font-label text-on-surface">Upcoming Holidays</h3>
				</div>
				{#each holidays as holiday (`${holiday.name}-${holiday.date.toISOString()}`)}
					<div class="flex items-center justify-between gap-3 text-body-sm">
						<span class="truncate text-on-surface">{holiday.name}</span>
						<time class="shrink-0 text-code-sm font-code text-outline" datetime={localDateKey(holiday.date)}>{holidayDate(holiday.date)}</time>
					</div>
				{:else}
					<p class="text-body-sm text-outline">No upcoming fixed-date holidays.</p>
				{/each}
				<p class="text-code-sm text-outline/70">Indonesia · fixed-date national holidays</p>
			</section>
		</section>

		<section
			class="glass-panel flex max-h-[min(56vh,36rem)] min-h-[200px] min-w-0 flex-col gap-3 overflow-hidden overscroll-contain rounded-2xl p-2.5 sm:min-h-[220px] sm:p-3 xl:min-h-0"
			aria-labelledby="events-heading"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<CalendarDays size={16} class="text-primary" />
					<div>
						<h2 id="events-heading" class="text-title-sm font-title text-on-surface">Events</h2>
						<p class="text-label-sm text-outline">{selectedDateLabel}</p>
					</div>
				</div>
			</div>
			<div class="scrollbar-none flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
				{#each selectedDayTasks as task (task.id)}
					<TaskCard
						{task}
						showStatus
						selected={task.id === selectedId}
						onselect={() => onselect(task.id)}
						onedit={() => onedit(task)}
					/>
				{:else}
					<EmptyState
						icon={Inbox}
						title={localDateKey(selectedDate) === localDateKey(today) ? 'No tasks scheduled for today.' : 'No tasks scheduled for this day.'}
						class="py-8"
					/>
				{/each}
			</div>
		</section>
	</div>

	<section
		class="glass-panel flex min-h-[240px] min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-2.5 sm:p-3 xl:min-h-64 xl:flex-1"
		aria-labelledby="incomplete-heading"
	>
		<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 id="incomplete-heading" class="text-title-sm font-title text-on-surface">Incomplete Tasks</h2>
				<p class="text-label-sm text-outline">Tasks that still need attention</p>
			</div>
			<nav class="scrollbar-none -mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label="Incomplete task filters">
				{#each INCOMPLETE_TASK_VIEWS as item (item.id)}
					<Button
						variant={incompleteView === item.id ? 'secondary' : 'ghost'}
						size="sm"
						aria-pressed={incompleteView === item.id}
						onclick={() => (incompleteView = item.id)}
					>
						{item.label}
					</Button>
				{/each}
			</nav>
		</div>
		<div
			class="scrollbar-none grid max-h-[min(52vh,32rem)] min-w-0 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 xl:max-h-none xl:min-h-0 2xl:grid-cols-3"
		>
			{#each incompleteTasks as task (task.id)}
				<TaskCard
					{task}
					selected={task.id === selectedId}
					onselect={() => onselect(task.id)}
					onedit={() => onedit(task)}
				/>
			{:else}
				<EmptyState
					icon={Inbox}
					title="No incomplete tasks in this view."
					class="col-span-full py-8"
				/>
			{/each}
		</div>
	</section>
</div>
