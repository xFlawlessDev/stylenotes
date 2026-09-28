import { describe, expect, it } from 'vitest';
import { createTask, timelineRange, type Task, type TaskDependency } from '$lib/stores/tasks';
import {
	ganttDayWidth,
	ganttDependencyLinks,
	ganttLinksForTask,
	ganttMonthGroups,
	ganttScaleContext,
	ganttScaleDayWidth,
	ganttTimelineColumns,
	ganttYearGroups
} from '$lib/stores/task-gantt';

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

describe('gantt timeline scales', () => {
	it('compresses the pixel-per-day more aggressively on week and month scales', () => {
		// A 90-day range in 600px: date clamps to the readable day floor, while the
		// wider scales are allowed to shrink further so the range still fits.
		expect(ganttScaleDayWidth('date', 90, 600)).toBe(18);
		expect(ganttScaleDayWidth('week', 90, 600)).toBe(6);
		expect(ganttScaleDayWidth('month', 90, 600)).toBe(6);
	});

	it('falls back to the default day width before the panel is measured', () => {
		expect(ganttScaleDayWidth('week', 90, Number.NaN)).toBe(30);
		expect(ganttScaleDayWidth('month', 0, 600)).toBe(30);
	});

	it('buckets the range into day columns that start at range.start', () => {
		const range = timelineRange([], { anchor: new Date(2026, 0, 1) });
		const columns = ganttTimelineColumns(range, 'date');
		expect(columns).toHaveLength(range.days);
		expect(columns[0]?.offset).toBe(0);
		expect(columns.every((column) => column.span === 1)).toBe(true);
		// The padded start is Tue Dec 30, 2025, so the first Saturday (Jan 3) sits at offset 4.
		expect(columns.find((column) => column.weekendStart)?.offset).toBe(4);
	});

	it('groups by ISO week, snapping every column after the first to Monday', () => {
		const range = timelineRange([], { anchor: new Date(2026, 0, 1) });
		const columns = ganttTimelineColumns(range, 'week');
		expect(columns[0]?.offset).toBe(0);
		// The range starts on Tuesday Dec 30, so the first column runs to the next Monday.
		expect(columns[0]?.span).toBe(6);
		expect(columns[0]?.label).toBe('W1');
		expect(columns[1]?.start.getDay()).toBe(1);
		expect(columns[1]?.offset).toBe(6);
		expect(columns.every((column, index) => index === 0 || column.start.getDay() === 1)).toBe(true);
		expect(columns.reduce((sum, column) => sum + column.span, 0)).toBe(range.days);
	});

	it('groups by calendar month and labels it with the month name', () => {
		const columns = ganttTimelineColumns(timelineRange([], { anchor: new Date(2026, 0, 1) }), 'month');
		expect(columns[0]?.label).toBe('Dec');
		expect(columns[0]?.title).toBe('December 2025');
		// The padded range runs Dec 30, 2025 → Jan 16, 2026, so it spans two month columns.
		expect(columns).toHaveLength(2);
		expect(columns[0]?.offset).toBe(0);
		expect(columns[0]?.span).toBe(2);
		expect(columns[1]?.start.getMonth()).toBe(0);
	});

	it('names the month/year context strip', () => {
		expect(ganttScaleContext(new Date(2026, 0, 1))).toBe('January 2026');
	});

	it('labels each calendar month once, spanning all of its days', () => {
		const range = timelineRange([], { anchor: new Date(2026, 0, 1) });
		const groups = ganttMonthGroups(range);
		// Dec 30, 2025 → Jan 16, 2026: a short December run then January.
		expect(groups.map((group) => group.label)).toEqual(['December 2025', 'January 2026']);
		expect(groups[0]?.offset).toBe(0);
		expect(groups[0]?.span).toBe(2);
		expect(groups[0]!.span + groups[1]!.span).toBe(range.days);
	});

	it('labels each calendar year once for the month scale strip', () => {
		const groups = ganttYearGroups(timelineRange([], { anchor: new Date(2026, 0, 1) }));
		expect(groups).toHaveLength(2);
		expect(groups[0]?.label).toBe('2025');
		expect(groups[1]?.label).toBe('2026');
	});
});
