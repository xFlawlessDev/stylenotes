import { describe, expect, it } from 'vitest';
import { canAddDependency, createTask, isTaskBlocked, type TaskDependency } from '$lib/stores/tasks';

const task = (id: string, workspaceId: string, completed = false) =>
	createTask({ id, workspaceId, completed, status: completed ? 'done' : 'todo' });

describe('task dependency rules', () => {
	it('rejects self and cross-workspace dependencies', () => {
		const a = task('a', 'one');
		const b = task('b', 'two');
		expect(canAddDependency('a', 'a', [a], [])).toBe(false);
		expect(canAddDependency('a', 'b', [a, b], [])).toBe(false);
	});

	it('rejects a dependency that would close a cycle', () => {
		const tasks = [task('a', 'one'), task('b', 'one'), task('c', 'one')];
		const dependencies: TaskDependency[] = [
			{ taskId: 'a', dependsOnTaskId: 'b' },
			{ taskId: 'b', dependsOnTaskId: 'c' },
		];
		expect(canAddDependency('c', 'a', tasks, dependencies)).toBe(false);
	});

	it('blocks until every dependency is complete', () => {
		const tasks = [task('a', 'one'), task('b', 'one'), task('c', 'one', true)];
		const dependencies: TaskDependency[] = [
			{ taskId: 'a', dependsOnTaskId: 'b' },
			{ taskId: 'a', dependsOnTaskId: 'c' },
		];
		expect(isTaskBlocked(tasks[0], tasks, dependencies)).toBe(true);
		expect(isTaskBlocked(tasks[1], tasks, dependencies)).toBe(false);
		const completed = tasks.map((item) => (item.id === 'b' ? { ...item, completed: true } : item));
		expect(isTaskBlocked(completed[0], completed, dependencies)).toBe(false);
	});
});
