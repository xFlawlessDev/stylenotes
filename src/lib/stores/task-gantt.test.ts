import { describe, expect, it } from 'vitest';
import { createTask, timelineRange, type Task, type TaskDependency } from '$lib/stores/tasks';
import { ganttDayWidth, ganttDependencyLinks, ganttLinksForTask } from '$lib/stores/task-gantt';

function task(id: string, startDay: number, span = 2, completed = false): Task {
	return createTask({
		id,
		workspaceId: 'w',
		startAt: new Date(2026, 0, startDay).toISOString(),
		dueAt: new Date(2026, 0, startDay + span - 1).toISOString(),
		completed,
		status: completed ? 'done' : 'todo'
	});
}

/** Starts on Dec 30, 2025, so Jan 2 sits at offset 3. */
function range() {
	return timelineRange([], { anchor: new Date(2026, 0, 1) });
}

describe('gantt day width', () => {
	it('fits the timeline into the available width within readable bounds', () => {
		// (1000 - 2) / 25 = 39.9, capped at 36.
		expect(ganttDayWidth(1000, 25)).toBe(36);
		// (600 - 2) / 25 = 23.9, floored to 23 so the timeline never overflows.
		expect(ganttDayWidth(600, 25)).toBe(23);
		// (300 - 2) / 25 = 11.9, raised to the readable minimum; the panel scrolls instead.
		expect(ganttDayWidth(300, 25)).toBe(18);
	});

	it('falls back to the default while the panel is unmeasured', () => {
		expect(ganttDayWidth(Number.NaN, 21)).toBe(30);
		expect(ganttDayWidth(500, 0)).toBe(30);
	});
});

describe('gantt dependency links', () => {
	it('connects the predecessor bar end to the dependent bar start', () => {
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];

		const links = ganttDependencyLinks([task('a', 2), task('b', 5)], range(), dependencies, {
			dayWidth: 30
		});

		expect(links).toHaveLength(1);
		expect(links[0]?.id).toBe('a->b');
		expect(links[0]?.open).toBe(true);

		// Jan 2 has offset 3 and spans two days, so the predecessor's right edge
		// sits at x = 149; the dependent (Jan 5, offset 6) starts at x = 181.
		// `a` is the first row (y = 26), `b` the second (y = 78).
		expect(links[0]?.path).toMatch(/^M 149 26 C /);
		expect(links[0]?.path).toMatch(/ 181 78$/);
	});

	it('marks a dependency as met once either side is complete', () => {
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];
		const graph = range();

		const donePredecessor = ganttDependencyLinks(
			[task('a', 2, 2, true), task('b', 5)],
			graph,
			dependencies,
			{ dayWidth: 30 }
		);
		expect(donePredecessor[0]?.open).toBe(false);

		const doneDependent = ganttDependencyLinks(
			[task('a', 2), task('b', 5, 2, true)],
			graph,
			dependencies,
			{ dayWidth: 30 }
		);
		expect(doneDependent[0]?.open).toBe(false);
	});

	it('skips dependencies whose tasks have no bar and uses the row order for y', () => {
		const dependencies: TaskDependency[] = [
			{ taskId: 'b', dependsOnTaskId: 'a' },
			{ taskId: 'c', dependsOnTaskId: 'missing' }
		];
		const undated = createTask({ id: 'missing', workspaceId: 'w' });

		const links = ganttDependencyLinks([task('b', 5), task('a', 2), undated], range(), dependencies, {
			dayWidth: 30
		});

		expect(links).toHaveLength(1);
		// `a` is the second row (y = 78), `b` the first (y = 26).
		expect(links[0]?.path).toMatch(/^M 149 78 C /);
		expect(links[0]?.path).toMatch(/ 181 26$/);
	});

	it('finds the links that touch a task', () => {
		const dependencies: TaskDependency[] = [
			{ taskId: 'b', dependsOnTaskId: 'a' },
			{ taskId: 'c', dependsOnTaskId: 'b' }
		];
		const links = ganttDependencyLinks(
			[task('a', 2), task('b', 5), task('c', 8)],
			range(),
			dependencies,
			{ dayWidth: 30 }
		);

		expect([...ganttLinksForTask(links, 'b')].sort()).toEqual(['a->b', 'b->c']);
		expect(ganttLinksForTask(links, 'a').size).toBe(1);
		expect(ganttLinksForTask(links, 'nope').size).toBe(0);
	});
});
