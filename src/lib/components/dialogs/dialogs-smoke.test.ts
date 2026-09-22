import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import AddFolderDialog from './AddFolderDialog.svelte';
import AddTagDialog from './AddTagDialog.svelte';
import ConfirmDialog from './ConfirmDialog.svelte';
import CreateNoteDialog from './CreateNoteDialog.svelte';
import MarkdownGuideDialog from './MarkdownGuideDialog.svelte';
import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';

const noop = () => {};

describe('dialogs', () => {
	it('renders every action through the shared button base', async () => {
		const cases: [string, unknown, Record<string, unknown>][] = [
			['AddTagDialog', AddTagDialog, { open: true, existing: [], onsubmit: noop }],
			['AddFolderDialog', AddFolderDialog, { open: true, labels: [], onsubmit: noop }],
			['CreateNoteDialog', CreateNoteDialog, { open: true, folders: [], onsubmit: noop }],
			['MarkdownGuideDialog', MarkdownGuideDialog, { open: true }],
			['TaskDialog', TaskDialog, { open: true, folders: [], notes: [], onsubmit: noop }],
			[
				'ConfirmDialog',
				ConfirmDialog,
				{ open: true, title: 'Delete this note?', description: 'Cannot be undone.' }
			]
		];

		for (const [name, component, props] of cases) {
			const target = document.createElement('div');
			document.body.appendChild(target);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const app = mount(component as any, { target, props });
			flushSync();

			const buttons = document.querySelectorAll('[data-slot="base-button"]');
			expect(buttons.length, name).toBeGreaterThan(0);

			// Let portals and transitions settle before tearing the dialog down.
			await new Promise((resolve) => setTimeout(resolve, 20));
			unmount(app);
			await new Promise((resolve) => setTimeout(resolve, 20));
			target.remove();
		}
	});
});
