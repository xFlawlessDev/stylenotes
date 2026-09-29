import { describe, expect, it, vi } from 'vitest';
import { createWikiController } from '$lib/content/wiki-controller';
import { createNote, type Note } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import type { WikiClick } from '$lib/content/wiki-links';

vi.mock('$lib/stores/notes', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/notes')>();
	return { ...actual, persistNote: vi.fn(async () => true) };
});

vi.mock('$lib/windows', () => ({
	NOTE_HEADING_EVENT: 'note:heading',
	NOTE_WINDOW_PREFIX: 'note-',
	openNoteWindow: vi.fn(async () => undefined),
	openTaskInWorkspace: vi.fn(async () => undefined)
}));

vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));

const task = createTask({ id: 't1', title: 'Host task', workspaceId: 'w' });
const notes = [createNote({ id: 'n1', title: 'Alpha', workspaceId: 'w' })];

/** A click whose candidate list names the given entities. */
function chooseClick(ids: string[]): WikiClick {
	return {
		heading: null,
		target: null,
		targetText: '',
		candidates: ids.map((id) => ({ id, kind: 'note' as const }))
	};
}

/** A click on a link text that matches nothing, so the plan creates a note. */
function createClick(title: string): WikiClick {
	return { heading: null, target: null, targetText: title, candidates: [] };
}

function setup(source = task, pool: Note[] = notes) {
	const added: Note[][] = [];
	const controller = createWikiController({
		flush: () => undefined,
		source: () => source,
		notes: () => pool,
		tasks: () => [],
		folders: () => [],
		onnotes: (next) => added.push(next)
	});
	return { controller, added };
}

describe('wiki controller', () => {
	it('reports the candidates for an ambiguous click', () => {
		const result = setup().controller.resolve(chooseClick(['n1']));
		expect(result.status).toBe('choose');
		if (result.status === 'choose') {
			expect(result.entities.map((entity) => entity.id)).toEqual(['n1']);
		}
	});

	it('treats a click with nothing to resolve as handled', () => {
		expect(setup().controller.resolve(chooseClick([])).status).toBe('handled');
	});

	it('opens a task target in the workspace', async () => {
		const { openTaskInWorkspace } = await import('$lib/windows');
		const { controller } = setup();
		await controller.open({ id: 't9', title: 'Other', kind: 'task', folder: 'personal' }, null);
		expect(openTaskInWorkspace).toHaveBeenCalledWith('t9');
	});

	it('creates a note for an unresolved link and announces it', async () => {
		const { controller, added } = setup(task, []);
		controller.resolve(createClick('Brand new'));
		await vi.waitFor(() => expect(added).toHaveLength(1));
		expect(added[0]?.[0]?.title).toBe('Brand new');
	});
});
