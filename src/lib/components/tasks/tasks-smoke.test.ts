import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';
import GanttHost from '$lib/components/tasks/gantt-test-host.svelte';
import type { Note } from '$lib/content/content';
import { createTask, type Task, type TaskDependency } from '$lib/stores/tasks';

const noop = () => {};

function task(id: string, start: string, due: string, completed = false): Task {
	return createTask({
		id,
		workspaceId: 'w',
		title: `Task ${id.toUpperCase()}`,
		startAt: new Date(`${start}T09:00:00`).toISOString(),
		dueAt: new Date(`${due}T17:00:00`).toISOString(),
		completed,
		status: completed ? 'done' : 'todo'
	});
}

describe('task dependency UI', () => {
	it('draws gantt arrows and a blocked status for open dependencies', async () => {
		const tasks = [task('a', '2026-01-02', '2026-01-03'), task('b', '2026-01-05', '2026-01-06')];
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(GanttHost, {
			target,
			props: { tasks, dependencies, selectedId: '', onselect: noop, onedit: noop }
		});
		flushSync();

		const paths = target.querySelectorAll('svg path[marker-end]');
		expect(paths).toHaveLength(1);
		const markerRef = paths[0]?.getAttribute('marker-end') ?? '';
		expect(markerRef).toMatch(/^url\(#gantt-arrow-open-.+\)$/);
		expect(paths[0]?.getAttribute('stroke-dasharray')).toBe('5 4');
		// The arrowhead marker the path references must exist on the same chart.
		const markerId = markerRef.slice('url(#'.length, -1);
		expect(target.querySelector(`marker[id="${markerId}"]`)).not.toBeNull();
		expect(target.textContent).toContain('Blocked by 1');
		expect(target.textContent).toContain('Waiting on dependency');
		expect(target.textContent).toContain('Dependency met');

		unmount(app);
		target.remove();
	});

	it('uses a solid arrow once the dependency is satisfied', async () => {
		const tasks = [task('a', '2026-01-02', '2026-01-03', true), task('b', '2026-01-05', '2026-01-06')];
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(GanttHost, {
			target,
			props: { tasks, dependencies, selectedId: 'b', onselect: noop, onedit: noop }
		});
		flushSync();

		const path = target.querySelector('svg path[marker-end]');
		expect(path?.getAttribute('marker-end')).toMatch(/met/);
		expect(path?.getAttribute('stroke-dasharray')).toBeNull();
		expect(target.textContent).not.toContain('Blocked by');

		unmount(app);
		target.remove();
	});

	it('renders the dependency editor when the dialog can save dependencies', async () => {
		const tasks = [task('a', '2026-01-02', '2026-01-03'), task('b', '2026-01-05', '2026-01-06')];
		const dependencies: TaskDependency[] = [{ taskId: 'b', dependsOnTaskId: 'a' }];
		const target = document.createElement('div');
		document.body.appendChild(target);

		const app = mount(TaskDialog, {
			target,
			props: {
				open: true,
				task: tasks[1] ?? null,
				folders: [],
				notes: [],
				tasks,
				dependencies,
				onsubmit: noop,
				onadddependency: () => null,
				onremovedependency: noop
			}
		});
		flushSync();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(document.body.textContent).toContain('Dependencies');
		expect(document.body.textContent).toContain('Task A');
		expect(document.querySelectorAll('[data-slot="base-button"]').length).toBeGreaterThan(0);

		unmount(app);
		await new Promise((resolve) => setTimeout(resolve, 20));
		target.remove();
	});

	it('lists every linked note and submits the whole list', async () => {
		const notes = [
			{ id: 'n1', title: 'Spec' },
			{ id: 'n2', title: 'Plan' }
		] as unknown as Note[];
		const target = document.createElement('div');
		document.body.appendChild(target);

		let submittedNoteIds: string[] | null = null;
		const app = mount(TaskDialog, {
			target,
			props: {
				open: true,
				task: createTask({ id: 't1', title: 'Ship it', noteIds: ['n1', 'n2'] }),
				folders: [],
				notes,
				onsubmit: (data) => {
					submittedNoteIds = data.noteIds;
				}
			}
		});
		flushSync();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(document.body.textContent).toContain('Linked notes');
		expect(document.body.textContent).toContain('Spec');
		expect(document.body.textContent).toContain('Plan');

		const submit = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')][0];
		submit?.click();
		flushSync();
		expect(submittedNoteIds).toEqual(['n1', 'n2']);

		unmount(app);
		await new Promise((resolve) => setTimeout(resolve, 20));
		target.remove();
	});
});
