import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import TaskDetailsEditor from '$lib/components/tasks/TaskDetailsEditor.svelte';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';

const task = createTask({ id: 't1', title: 'The task', workspaceId: 'one' });
const notes = [
	createNote({ id: 'p1', title: 'Alpha', workspaceId: 'one' }),
	createNote({ id: 'p2', title: 'Alphabet', workspaceId: 'one' }),
	createNote({ id: 'p3', title: 'Alphanumeric', workspaceId: 'one' })
];

function press(target: HTMLElement, key: string) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
	flushSync();
}

/** Mounts the picker, types `[[Al`, and returns the textarea plus row helpers. */
function openPicker() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(TaskDetailsEditor, {
		target,
		props: { detail: '', task, notes, tasks: [], folders: [], onwikilink: () => {} }
	});
	flushSync();

	const textarea = target.querySelector('textarea')!;
	textarea.focus();
	textarea.value = '[[Al';
	textarea.setSelectionRange(4, 4);
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();

	const rows = () => [...document.querySelectorAll('[role="option"]')];
	const active = () => rows().findIndex((row) => row.getAttribute('aria-selected') === 'true');
	const cleanup = () => {
		unmount(app);
		target.remove();
	};
	return { textarea, rows, active, cleanup };
}

describe('wiki popover keyboard navigation', () => {
	it('opens with the first suggestion active', () => {
		const picker = openPicker();
		expect(picker.rows()).toHaveLength(3);
		expect(picker.active()).toBe(0);
		picker.cleanup();
	});

	it('moves the selection down and up', () => {
		const picker = openPicker();
		press(picker.textarea, 'ArrowDown');
		expect(picker.active()).toBe(1);
		press(picker.textarea, 'ArrowDown');
		expect(picker.active()).toBe(2);
		press(picker.textarea, 'ArrowUp');
		expect(picker.active()).toBe(1);
		picker.cleanup();
	});

	it('wraps past both ends', () => {
		const picker = openPicker();
		press(picker.textarea, 'ArrowUp');
		expect(picker.active()).toBe(2);
		press(picker.textarea, 'ArrowDown');
		expect(picker.active()).toBe(0);
		picker.cleanup();
	});

	it('inserts the active suggestion on Enter and closes', () => {
		const picker = openPicker();
		press(picker.textarea, 'ArrowDown');
		press(picker.textarea, 'Enter');
		expect(picker.textarea.value).toBe('[[Alphabet]]');
		expect(picker.rows()).toHaveLength(0);
		picker.cleanup();
	});

	it('inserts the active suggestion on Tab', () => {
		const picker = openPicker();
		press(picker.textarea, 'ArrowDown');
		press(picker.textarea, 'ArrowDown');
		press(picker.textarea, 'Tab');
		expect(picker.textarea.value).toBe('[[Alphanumeric]]');
		picker.cleanup();
	});

	it('closes on Escape without inserting', () => {
		const picker = openPicker();
		press(picker.textarea, 'Escape');
		expect(picker.rows()).toHaveLength(0);
		expect(picker.textarea.value).toBe('[[Al');
		picker.cleanup();
	});

	it('keeps the arrow selection while the query is unchanged', () => {
		const picker = openPicker();
		press(picker.textarea, 'ArrowDown');
		// A bare re-render must not snap the highlight back to the head.
		flushSync();
		expect(picker.active()).toBe(1);
		press(picker.textarea, 'Enter');
		expect(picker.textarea.value).toBe('[[Alphabet]]');
		picker.cleanup();
	});
});
