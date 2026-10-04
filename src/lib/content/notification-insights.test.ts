import { describe, expect, it } from 'vitest';
import { createTask, type Task, type TaskDependency } from '$lib/stores/tasks';
import {
	buildNotificationInsights,
	taskInsightCounts,
	type NotificationInsightInput
} from '$lib/content/notification-insights';

const at = (year: number, month: number, day: number, hour = 9) =>
	new Date(year, month - 1, day, hour).toISOString();
const task = (overrides: Partial<Task> = {}) => createTask(overrides);

const base: NotificationInsightInput = {
	indexing: { ready: true, active: false, indexed: 0, pending: 0 },
	tasks: { overdue: 0, today: 0, blocked: 0 },
	suggestions: 0,
	vaultConflicts: 0,
	orphanAttachments: 0,
	journal: { enabled: false, written: false }
};

describe('taskInsightCounts', () => {
	const now = new Date(2026, 8, 23, 12);
	const tasks = [
		task({ id: 'overdue', dueAt: at(2026, 9, 21) }),
		task({ id: 'today', dueAt: at(2026, 9, 23, 20) }),
		task({ id: 'future', dueAt: at(2026, 9, 30) }),
		task({ id: 'done', dueAt: at(2026, 9, 21), status: 'done' }),
	];
	const dependencies: TaskDependency[] = [{ taskId: 'today', dependsOnTaskId: 'future' }];

	it('counts open overdue, today and blocked tasks', () => {
		expect(taskInsightCounts(tasks, dependencies, now)).toEqual({
			overdue: 1,
			today: 1,
			blocked: 1
		});
	});

	it('excludes completed tasks from every bucket', () => {
		const completed = [task({ id: 'done', dueAt: at(2026, 9, 21), completed: true })];
		expect(taskInsightCounts(completed, [], now)).toEqual({ overdue: 0, today: 0, blocked: 0 });
	});
});

describe('buildNotificationInsights', () => {
	it('is empty when nothing needs attention', () => {
		expect(buildNotificationInsights({ ...base })).toEqual([]);
	});

	it('leads with the daily task summary and flags overdue work', () => {
		const rows = buildNotificationInsights({
			...base,
			tasks: { overdue: 2, today: 1, blocked: 0 }
		});
		expect(rows[0].id).toBe('tasks');
		expect(rows[0].tone).toBe('error');
		expect(rows[0].target).toEqual({ kind: 'section', section: 'tasks' });
	});

	it('shows an active index with progress', () => {
		const rows = buildNotificationInsights({
			...base,
			indexing: { ready: true, active: true, indexed: 7, pending: 3 }
		});
		expect(rows.map((row) => row.id)).toEqual(['indexing']);
		expect(rows[0].bodyKey).toBe('shell.notification.insight.indexing.progress');
		expect(rows[0].bodyParams).toEqual({ done: 7, total: 10 });
	});

	it('shows a backlog when not actively indexing', () => {
		const rows = buildNotificationInsights({
			...base,
			indexing: { ready: true, active: false, indexed: 7, pending: 3 }
		});
		expect(rows[0].bodyKey).toBe('shell.notification.insight.indexing.behindBody');
	});

	it('never raises an indexing row while memory is not ready', () => {
		expect(
			buildNotificationInsights({
				...base,
				indexing: { ready: false, active: true, indexed: 0, pending: 5 }
			})
		).toEqual([]);
	});

	it('adds every other source when it has something to say', () => {
		const rows = buildNotificationInsights({
			...base,
			vaultConflicts: 2,
			suggestions: 4,
			orphanAttachments: 1,
			journal: { enabled: true, written: false }
		});
		expect(rows.map((row) => row.id)).toEqual(['vault', 'suggestions', 'attachments', 'journal']);
		expect(rows.find((row) => row.id === 'vault')?.target).toEqual({
			kind: 'settings',
			section: 'vault'
		});
	});

	it('hides the journal row once today is written', () => {
		expect(
			buildNotificationInsights({
				...base,
				journal: { enabled: true, written: true }
			})
		).toEqual([]);
	});

	it('hides the journal row when the feature is off', () => {
		expect(
			buildNotificationInsights({
				...base,
				journal: { enabled: false, written: false }
			})
		).toEqual([]);
	});
});
