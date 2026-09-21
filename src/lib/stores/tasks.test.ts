import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
	list: vi.fn(),
	upsert: vi.fn(),
	remove: vi.fn(),
	clear: vi.fn(),
	replaceAll: vi.fn(),
}));

vi.mock('$lib/db', () => ({ tasksRepo: repo }));

import { tasksRepo } from '$lib/db';
import {
	applyTaskPatch,
	createTask,
	filterTasks,
	matchesTaskQuery,
	isTaskOverdue,
	moveTaskInList,
	nextPosition,
	overlayTasks,
	matchesDueFilter,
	reorderWithinColumn,
	sortOverlayTasks,
	sortTasks,
	taskBar,
	tasksByStatus,
	timelineRange,
	toDateInput,
	fromDateInput,
	type Task,
} from '$lib/stores/tasks';
import {
	hydrateTasks,
	refreshTasks,
	persistTask,
	removeTask,
	clearTasks,
	taskStore,
} from '$lib/stores/tasks.svelte';

const at = (day: number, hour = 9) => {
	const date = new Date(2026, 0, day, hour, 0, 0, 0);
	return date.toISOString();
};

const task = (over: Partial<Task> = {}): Task => createTask(over);

beforeEach(() => {
	vi.mocked(tasksRepo.list).mockReset();
	vi.mocked(tasksRepo.upsert).mockReset().mockResolvedValue(undefined);
	vi.mocked(tasksRepo.remove).mockReset().mockResolvedValue(undefined);
	vi.mocked(tasksRepo.clear).mockReset().mockResolvedValue(undefined);
	vi.mocked(tasksRepo.replaceAll).mockReset().mockResolvedValue(undefined);
	taskStore.items = [];
});

describe('createTask', () => {
	it('fills defaults', () => {
		const item = createTask({});
		expect(item.title).toBe('Untitled task');
		expect(item.status).toBe('todo');
		expect(item.priority).toBe('medium');
		expect(item.folder).toBe('personal');
		expect(item.completed).toBe(false);
		expect(item.overlay).toBe(false);
	});

	it('derives completed from a done status', () => {
		expect(createTask({ status: 'done' }).completed).toBe(true);
	});

	it('falls back on unknown status and priority', () => {
		const item = createTask({ status: 'nope' as Task['status'], priority: 'urgent' as Task['priority'] });
		expect(item.status).toBe('todo');
		expect(item.priority).toBe('medium');
	});
});

describe('tasksByStatus', () => {
	it('groups by status and orders by position', () => {
		const groups = tasksByStatus([
			task({ id: 'b', status: 'todo', position: 2 }),
			task({ id: 'a', status: 'todo', position: 1 }),
			task({ id: 'c', status: 'done', position: 0 }),
		]);
		expect(groups.todo.map((item) => item.id)).toEqual(['a', 'b']);
		expect(groups.done.map((item) => item.id)).toEqual(['c']);
		expect(groups.doing).toEqual([]);
	});
});

describe('sortTasks', () => {
	it('orders by priority then due date', () => {
		const sorted = sortTasks([
			task({ id: 'low', priority: 'low', dueAt: at(1) }),
			task({ id: 'high', priority: 'high', dueAt: at(9) }),
			task({ id: 'high-soon', priority: 'high', dueAt: at(2) }),
		]);
		expect(sorted.map((item) => item.id)).toEqual(['high-soon', 'high', 'low']);
	});
});

describe('overlayTasks', () => {
	it('keeps only docked tasks, ordered by priority then due date', () => {
		const items = [
			task({ id: 'off', overlay: false, priority: 'high', dueAt: at(1) }),
			task({ id: 'low', overlay: true, priority: 'low', dueAt: at(1) }),
			task({ id: 'high', overlay: true, priority: 'high', dueAt: at(2) }),
		];
		expect(overlayTasks(items).map((item) => item.id)).toEqual(['high', 'low']);
	});

	it('returns an empty list when nothing is docked', () => {
		expect(overlayTasks([task({ id: 'a' })])).toEqual([]);
	});

	it('filters docked tasks by status and priority', () => {
		const items = [
			task({ id: 'todo', overlay: true, status: 'todo', priority: 'high' }),
			task({ id: 'doing', overlay: true, status: 'doing', priority: 'high' }),
			task({ id: 'low', overlay: true, status: 'doing', priority: 'low' }),
		];
		expect(overlayTasks(items, { status: 'doing' }).map((item) => item.id)).toEqual([
			'doing',
			'low'
		]);
		expect(overlayTasks(items, { priority: 'low' }).map((item) => item.id)).toEqual(['low']);
		expect(overlayTasks(items, { status: 'done' })).toEqual([]);
	});
});

describe('sortOverlayTasks', () => {
	const items = [
		task({ id: 'b', title: 'Beta', priority: 'low', dueAt: at(2), position: 0 }),
		task({ id: 'a', title: 'Alpha', priority: 'high', dueAt: at(5), position: 1 }),
		task({ id: 'c', title: 'Gamma', priority: 'medium', dueAt: at(1), position: 2, status: 'doing' }),
	];

	it('defaults to the smart order (priority, then due date)', () => {
		expect(sortOverlayTasks(items).map((item) => item.id)).toEqual(['a', 'c', 'b']);
	});

	it('sorts by due date first', () => {
		expect(sortOverlayTasks(items, 'due').map((item) => item.id)).toEqual(['c', 'b', 'a']);
	});

	it('sorts by priority first', () => {
		expect(sortOverlayTasks(items, 'priority').map((item) => item.id)).toEqual(['a', 'c', 'b']);
	});

	it('sorts by status pipeline', () => {
		expect(sortOverlayTasks(items, 'status').map((item) => item.id)).toEqual(['a', 'b', 'c']);
	});

	it('sorts by title', () => {
		expect(sortOverlayTasks(items, 'title').map((item) => item.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('filterTasks', () => {
	const items = [
		task({ id: 'a', title: 'Alpha report', folder: 'work', noteId: 'n1' }),
		task({ id: 'b', title: 'Beta cleanup', notes: 'alpha mention', folder: 'personal' }),
	];

	it('filters by folder', () => {
		expect(filterTasks(items, { folder: 'work' }).map((t) => t.id)).toEqual(['a']);
		expect(filterTasks(items, { folder: 'all' })).toHaveLength(2);
	});

	it('matches title and notes case-insensitively', () => {
		expect(filterTasks(items, { query: 'ALPHA' }).map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('filters by linked note', () => {
		expect(filterTasks(items, { noteId: 'n1' }).map((t) => t.id)).toEqual(['a']);
	});

	it('filters by priority', () => {
		const list = [
			task({ id: 'hi', priority: 'high' }),
			task({ id: 'lo', priority: 'low' }),
		];
		expect(filterTasks(list, { priority: 'high' }).map((t) => t.id)).toEqual(['hi']);
		expect(filterTasks(list, { priority: 'all' })).toHaveLength(2);
	});
});

describe('matchesTaskQuery', () => {
	const item = task({
		title: 'Draft spec',
		notes: 'outline the API',
		folder: 'work',
		status: 'review',
		priority: 'high',
	});

	it('matches title, notes, folder, status, and priority terms', () => {
		expect(matchesTaskQuery(item, 'draft')).toBe(true);
		expect(matchesTaskQuery(item, 'outline')).toBe(true);
		expect(matchesTaskQuery(item, 'work')).toBe(true);
		expect(matchesTaskQuery(item, 'in review')).toBe(true);
		expect(matchesTaskQuery(item, 'HIGH')).toBe(true);
	});

	it('matches everything for a blank query and nothing for a miss', () => {
		expect(matchesTaskQuery(item, '   ')).toBe(true);
		expect(matchesTaskQuery(item, 'missing')).toBe(false);
	});
});

describe('matchesDueFilter', () => {
	const now = new Date(2026, 0, 10);
	const item = (over: Partial<Task>) => task({ dueAt: at(10), ...over });

	it('accepts everything for "any"', () => {
		expect(matchesDueFilter(task({}), 'any', now)).toBe(true);
	});

	it('matches overdue unfinished tasks only', () => {
		expect(matchesDueFilter(item({ dueAt: at(9) }), 'overdue', now)).toBe(true);
		expect(matchesDueFilter(item({ dueAt: at(9), status: 'done' }), 'overdue', now)).toBe(false);
		expect(matchesDueFilter(item({ dueAt: at(11) }), 'overdue', now)).toBe(false);
	});

	it('matches tasks due today', () => {
		expect(matchesDueFilter(item({ dueAt: at(10) }), 'today', now)).toBe(true);
		expect(matchesDueFilter(item({ dueAt: at(11) }), 'today', now)).toBe(false);
	});

	it('matches tasks due in the next seven days', () => {
		expect(matchesDueFilter(item({ dueAt: at(16) }), 'week', now)).toBe(true);
		expect(matchesDueFilter(item({ dueAt: at(17) }), 'week', now)).toBe(false);
		expect(matchesDueFilter(task({ dueAt: null }), 'week', now)).toBe(false);
	});
});

describe('applyTaskPatch', () => {
	it('marks completed when moved to done and clears it otherwise', () => {
		const item = task({ status: 'todo' });
		expect(applyTaskPatch(item, { status: 'done' }).completed).toBe(true);
		expect(applyTaskPatch(task({ status: 'done' }), { status: 'doing' }).completed).toBe(false);
	});

	it('keeps status when given an unknown value', () => {
		const item = task({ status: 'review' });
		expect(applyTaskPatch(item, { status: 'bogus' as Task['status'] }).status).toBe('review');
	});

	it('clamps a due date that precedes the start date', () => {
		const item = task({ startAt: at(5), dueAt: at(6) });
		expect(applyTaskPatch(item, { startAt: at(10), dueAt: at(3) }).dueAt).toBe(at(10));
	});
});

describe('timelineRange / taskBar', () => {
	it('pads the range around task dates', () => {
		const anchor = new Date(2026, 0, 10);
		const range = timelineRange([task({ startAt: at(12), dueAt: at(14) })], {
			anchor,
			padding: 1,
			minDays: 3,
		});
		expect(range.days).toBe(5);
		expect(toDateInput(range.start.toISOString())).toBe('2026-01-11');
	});

	it('keeps the minimum span when there are no dated tasks', () => {
		const range = timelineRange([], { anchor: new Date(2026, 0, 10), minDays: 14, padding: 0 });
		expect(range.days).toBe(14);
	});

	it('positions a bar within the range', () => {
		const range = { start: new Date(2026, 0, 1), days: 31 };
		const bar = taskBar(task({ startAt: at(3), dueAt: at(5) }), range);
		expect(bar).toEqual({ offset: 2, span: 3 });
	});

	it('returns null for undated tasks', () => {
		const range = { start: new Date(2026, 0, 1), days: 31 };
		expect(taskBar(task({}), range)).toBeNull();
	});
});

describe('isTaskOverdue', () => {
	it('flags past due dates that are not finished', () => {
		const now = new Date(2026, 0, 10);
		expect(isTaskOverdue(task({ dueAt: at(9) }), now)).toBe(true);
		expect(isTaskOverdue(task({ dueAt: at(9), status: 'done' }), now)).toBe(false);
		expect(isTaskOverdue(task({ dueAt: at(11) }), now)).toBe(false);
	});
});

describe('nextPosition / reorderWithinColumn', () => {
	it('returns the next slot in a column', () => {
		expect(nextPosition([task({ status: 'todo', position: 4 })], 'todo')).toBe(5);
		expect(nextPosition([], 'doing')).toBe(0);
	});

	it('reorders positions within a column', () => {
		const items = [
			task({ id: 'a', status: 'todo', position: 0 }),
			task({ id: 'b', status: 'todo', position: 1 }),
			task({ id: 'c', status: 'todo', position: 2 }),
		];
		const next = reorderWithinColumn(items, 'todo', 'c', 'a');
		expect(next.find((t) => t.id === 'c')?.position).toBe(0);
		expect(next.find((t) => t.id === 'a')?.position).toBe(1);
	});
});

describe('moveTaskInList', () => {
	it('appends a task to the end of the target column', () => {
		const items = [
			task({ id: 'a', status: 'todo', position: 0 }),
			task({ id: 'b', status: 'doing', position: 0 }),
		];
		const next = moveTaskInList(items, 'a', 'doing', null);
		expect(next.find((t) => t.id === 'a')).toMatchObject({ status: 'doing', position: 1 });
		expect(next.find((t) => t.id === 'b')?.position).toBe(0);
	});

	it('inserts before the drop target and renumbers the column', () => {
		const items = [
			task({ id: 'a', status: 'doing', position: 0 }),
			task({ id: 'b', status: 'doing', position: 1 }),
			task({ id: 'c', status: 'todo', position: 0 }),
		];
		const next = moveTaskInList(items, 'c', 'doing', 'a');
		expect(next.map((t) => `${t.id}:${t.position}`)).toEqual(['a:1', 'b:2', 'c:0']);
	});

	it('completes a task dropped in the done column', () => {
		const items = [task({ id: 'a', status: 'todo', position: 0 })];
		const next = moveTaskInList(items, 'a', 'done', null);
		expect(next[0]).toMatchObject({ status: 'done', completed: true });
	});

	it('keeps the list when the task is missing', () => {
		const items = [task({ id: 'a' })];
		expect(moveTaskInList(items, 'nope', 'doing', null)).toBe(items);
	});
});

describe('date input helpers', () => {
	it('round-trips through the date input format', () => {
		const value = fromDateInput('2026-02-03');
		expect(value).not.toBeNull();
		expect(toDateInput(value)).toBe('2026-02-03');
	});

	it('returns null for empty or invalid input', () => {
		expect(fromDateInput('')).toBeNull();
		expect(toDateInput(null)).toBe('');
	});
});

describe('store persistence', () => {
	it('loads tasks straight from the database, with no seed fallback', async () => {
		vi.mocked(tasksRepo.list).mockResolvedValue([task({ id: 'real' })]);
		const items = await hydrateTasks();
		expect(items.map((item) => item.id)).toEqual(['real']);
		expect(tasksRepo.replaceAll).not.toHaveBeenCalled();
	});

	it('resolves to an empty list when the database has no tasks', async () => {
		vi.resetModules();
		vi.mocked(tasksRepo.list).mockResolvedValue([]);
		const mod = await import('$lib/stores/tasks.svelte');
		const items = await mod.hydrateTasks();
		expect(items).toEqual([]);
	});

	it('falls back to an empty list when the database is unavailable', async () => {
		vi.resetModules();
		vi.mocked(tasksRepo.list).mockRejectedValue(new Error('no db'));
		const mod = await import('$lib/stores/tasks.svelte');
		const items = await mod.hydrateTasks();
		expect(items).toEqual([]);
	});

	it('refreshes from the database even after hydrating', async () => {
		vi.resetModules();
		vi.mocked(tasksRepo.list).mockResolvedValue([task({ id: 'a' })]);
		const mod = await import('$lib/stores/tasks.svelte');
		await mod.hydrateTasks();
		vi.mocked(tasksRepo.list).mockResolvedValue([task({ id: 'b' })]);
		const items = await mod.refreshTasks();
		expect(items.map((item) => item.id)).toEqual(['b']);
	});

	it('persists, removes and clears single tasks', async () => {
		await persistTask(task({ id: 'x' }));
		await removeTask('x');
		await clearTasks();
		expect(tasksRepo.upsert).toHaveBeenCalled();
		expect(tasksRepo.remove).toHaveBeenCalledWith('x');
		expect(tasksRepo.clear).toHaveBeenCalled();
	});
});