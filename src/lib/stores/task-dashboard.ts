import { parseTaskDate, startOfDay, taskPriority, taskStatus, type Task } from './tasks';

export type IncompleteTaskView = 'today' | 'priority' | 'upcoming' | 'all';
export type DashboardHoliday = { month: number; day: number; name: string };

export const INCOMPLETE_TASK_VIEWS: { id: IncompleteTaskView; label: string }[] = [
	{ id: 'today', label: 'Today' },
	{ id: 'priority', label: 'Priority' },
	{ id: 'upcoming', label: 'Upcoming' },
	{ id: 'all', label: 'All' }
];

export const INDONESIAN_FIXED_HOLIDAYS: DashboardHoliday[] = [
	{ month: 1, day: 1, name: 'Tahun Baru Masehi' },
	{ month: 5, day: 1, name: 'Hari Buruh Internasional' },
	{ month: 6, day: 1, name: 'Hari Lahir Pancasila' },
	{ month: 8, day: 17, name: 'Hari Kemerdekaan Republik Indonesia' },
	{ month: 12, day: 25, name: 'Hari Natal' }
];

export function localDateKey(date: Date): string {
	return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export function taskMatchesDate(task: Task, date: Date): boolean {
	const key = localDateKey(date);
	return [task.startAt, task.dueAt].some((value) => {
		const parsed = parseTaskDate(value);
		return parsed !== null && localDateKey(parsed) === key;
	});
}

export function tasksForDate(tasks: Task[], date: Date): Task[] {
	return tasks.filter(
		(task) => !task.completed && taskStatus(task) !== 'done' && taskMatchesDate(task, date)
	);
}

export function incompleteTasksForView(
	tasks: Task[],
	view: IncompleteTaskView,
	now = new Date()
): Task[] {
	const incomplete = tasks.filter((task) => !task.completed && taskStatus(task) !== 'done');
	const today = startOfDay(now);
	const todayKey = localDateKey(today);
	const limit = new Date(today);
	limit.setDate(limit.getDate() + 7);
	const limitKey = localDateKey(limit);

	const filtered = incomplete.filter((task) => {
		if (view === 'all') return true;
		if (view === 'priority') return taskPriority(task) === 'high';
		const due = parseTaskDate(task.dueAt);
		if (!due) return false;
		const dueKey = localDateKey(due);
		if (view === 'today') return dueKey === todayKey;
		return dueKey > todayKey && dueKey <= limitKey;
	});

	return [...filtered].sort((a, b) => {
		const aDue = a.dueAt ?? '9999-12-31';
		const bDue = b.dueAt ?? '9999-12-31';
		return aDue.localeCompare(bDue) || a.title.localeCompare(b.title);
	});
}

export function monthCalendarDays(month: Date): Date[] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const offset = (first.getDay() + 6) % 7;
	const start = new Date(first);
	start.setDate(first.getDate() - offset);
	const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	const count = Math.ceil((offset + days) / 7) * 7;
	return Array.from({ length: count }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return date;
	});
}

export function upcomingHolidays(
	holidays: DashboardHoliday[] = INDONESIAN_FIXED_HOLIDAYS,
	now = new Date(),
	count = 3
): { date: Date; name: string }[] {
	const today = startOfDay(now);
	const candidates = [-1, 0, 1, 2].flatMap((yearOffset) =>
		holidays.map((holiday) => ({
			date: new Date(today.getFullYear() + yearOffset, holiday.month - 1, holiday.day),
			name: holiday.name
		}))
	);
	return candidates
		.filter(({ date }) => startOfDay(date).getTime() >= today.getTime())
		.sort((a, b) => a.date.getTime() - b.date.getTime())
		.slice(0, count);
}
