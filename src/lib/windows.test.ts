import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	emit: vi.fn().mockResolvedValue(undefined),
	show: vi.fn().mockResolvedValue(undefined),
	unminimize: vi.fn().mockResolvedValue(undefined),
	setFocus: vi.fn().mockResolvedValue(undefined),
	getByLabel: vi.fn()
}));

vi.mock('@tauri-apps/api/event', () => ({ emit: mocks.emit }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'note-1' }) }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
	WebviewWindow: { getByLabel: mocks.getByLabel }
}));

let windows!: typeof import('$lib/windows');

beforeAll(async () => {
	// `windows.ts` reads `isTauri` at module scope, so stub it before importing.
	vi.stubGlobal('__TAURI_INTERNALS__', {});
	windows = await import('$lib/windows');
});

beforeEach(() => {
	mocks.getByLabel.mockResolvedValue({
		show: mocks.show,
		unminimize: mocks.unminimize,
		setFocus: mocks.setFocus
	});
});

describe('openTaskInWorkspace', () => {
	it('asks the workspace for the List view with the task selected', async () => {
		await windows.openTaskInWorkspace('task-1');

		expect(mocks.emit).toHaveBeenCalledWith(windows.NAVIGATE_EVENT, {
			section: 'tasks',
			view: 'list',
			recordId: 'task-1'
		});
	});

	it('reveals and focuses the workspace window', async () => {
		await windows.openTaskInWorkspace('task-1');

		expect(mocks.getByLabel).toHaveBeenCalledWith('workspace');
		expect(mocks.show).toHaveBeenCalled();
		expect(mocks.setFocus).toHaveBeenCalled();
	});
});

describe('openTasksInWorkspace', () => {
	it('keeps the Dashboard view for the plain tasks shortcut', async () => {
		await windows.openTasksInWorkspace();

		expect(mocks.emit).toHaveBeenCalledWith(windows.NAVIGATE_EVENT, {
			section: 'tasks',
			view: 'dashboard'
		});
	});
});
