import { describe, expect, it } from 'vitest';
import { createTask, type Task } from '$lib/stores/tasks';
import {
	incompleteTasksForView,
	localDateKey,
	monthCalendarDays,
	taskMatchesDate,
	tasksForDate,
	upcomingHolidays
} from '$lib/stores/task-dashboard';

const at = (year: number, month: number, day: number, hour = 9) =>
	new Date(year, month - 1, day, hour).toISOString();
const task = (overrides: Partial<Task> = {}) => createTask(overrides);

describe('task dashboard dates', () => {
	it('matches task start or due dates by local calendar day', () => {
		const date = new Date(2026, 8, 23, 0);
		expect(taskMatchesDate(task({ startAt: at(2026, 9, 23) }), date)).toBe(true);
		expect(taskMatchesDate(task({ dueAt: at(2026, 9, 23, 23) }), date)).toBe(true);
		expect(taskMatchesDate(task({ dueAt: at(2026, 9, 24) }), date)).toBe(false);
	});

	it('shows incomplete tasks starting or due on the selected date', () => {
		const date = new Date(2026, 8, 23);
		const items = [
			task({ id: 'start', startAt: at(2026, 9, 23) }),
			task({ id: 'due', dueAt: at(2026, 9, 23) }),
			task({ id: 'done', dueAt: at(2026, 9, 23), status: 'done' }),
			task({ id: 'later', dueAt: at(2026, 9, 24) })
		];
		expect(tasksForDate(items, date).map((item) => item.id)).toEqual(['start', 'due']);
	});
});

describe('incomplete task views', () => {
	const now = new Date(2026, 8, 23, 15);
	const items = [
		task({ id: 'today', dueAt: at(2026, 9, 23) }),
		task({ id: 'week', dueAt: at(2026, 9, 30) }),
		task({ id: 'after', dueAt: at(2026, 10, 1) }),
		task({ id: 'priority', priority: 'high' }),
		task({ id: 'done', dueAt: at(2026, 9, 23), status: 'done', priority: 'high' }),
		task({ id: 'completed', completed: true, priority: 'high' })
	];

	it('filters due today and includes the seventh upcoming day', () => {
		expect(incompleteTasksForView(items, 'today', now).map((item) => item.id)).toEqual(['today']);
		expect(incompleteTasksForView(items, 'upcoming', now).map((item) => item.id)).toEqual(['week']);
	});

	it('filters high-priority items and excludes completed tasks', () => {
		expect(incompleteTasksForView(items, 'priority', now).map((item) => item.id)).toEqual(['priority']);
		expect(incompleteTasksForView(items, 'all', now).map((item) => item.id)).toEqual([
			'today', 'week', 'after', 'priority'
		]);
	});
});

describe('mini calendar', () => {
	it('returns complete Monday-first weeks across month and year boundaries', () => {
		const days = monthCalendarDays(new Date(2026, 1, 1));
		expect(days.length % 7).toBe(0);
		expect(days[0].getDay()).toBe(1);
		expect(days[0].getFullYear()).toBe(2026);
		expect(days[0].getMonth()).toBe(0);
		expect(days.at(-1)?.getDay()).toBe(0);
		expect(localDateKey(days[0])).toBe('2026-01-26');
	});
});

describe('upcoming holidays', () => {
	it('returns the next fixed-date holidays in chronological order', () => {
		const holidays = upcomingHolidays(undefined, new Date(2026, 11, 26), 2);
		expect(holidays.map(({ name, date }) => [name, localDateKey(date)])).toEqual([
			['Tahun Baru Masehi', '2027-01-01'],
			['Hari Buruh Internasional', '2027-05-01']
		]);
	});

	it('includes a holiday occurring today', () => {
		const holidays = upcomingHolidays(undefined, new Date(2026, 7, 17), 1);
		expect(holidays.map(({ name }) => name)).toEqual(['Hari Kemerdekaan Republik Indonesia']);
	});
});
