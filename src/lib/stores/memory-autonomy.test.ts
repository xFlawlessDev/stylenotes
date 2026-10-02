import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The background scheduler is the layer that decides *when* to re-embed; the
 * index work itself is covered elsewhere. These tests pin the three triggers
 * (change debounce, backfill, sweep), the opt-out, and the single-writer guard.
 */

const mocks = vi.hoisted(() => ({
	buildIndex: vi.fn(async () => true),
	refreshCounts: vi.fn(async () => undefined),
	reindexEntity: vi.fn(async () => true),
	memoryReady: vi.fn(() => true),
	memoryStore: { autoIndex: true, indexing: false, pending: 0 },
	handlers: new Map<string, (event: { payload: unknown }) => void>(),
	unlisten: vi.fn()
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/windows', () => ({
	isTauri: true,
	currentWindowRole: () => 'workspace'
}));
vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(async (event: string, handler: (payload: unknown) => void) => {
		mocks.handlers.set(event, handler);
		return mocks.unlisten;
	})
}));
vi.mock('$lib/stores/memory.svelte', () => ({
	buildIndex: mocks.buildIndex,
	refreshCounts: mocks.refreshCounts,
	reindexEntity: mocks.reindexEntity,
	memoryReady: mocks.memoryReady,
	memoryStore: mocks.memoryStore,
	MEMORY_CHANGED: 'memory:changed'
}));
vi.mock('$lib/stores/notes', () => ({ NOTES_CHANGED: 'notes:changed' }));
vi.mock('$lib/stores/tasks.svelte', () => ({ TASKS_CHANGED: 'tasks:changed' }));

const BACKFILL_MS = 8_000;
const REINDEX_MS = 1_200;
const SWEEP_MS = 300_000;

type Autonomy = typeof import('$lib/stores/memory-autonomy');

async function load(): Promise<Autonomy> {
	vi.resetModules();
	mocks.handlers.clear();
	return import('$lib/stores/memory-autonomy');
}

function noteChanged(ids?: string[]) {
	mocks.handlers.get('notes:changed')?.({ payload: { source: 'note-x', changedIds: ids } });
}

function taskChanged() {
	mocks.handlers.get('tasks:changed')?.({ payload: undefined });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	mocks.handlers.clear();
	mocks.memoryStore.autoIndex = true;
	mocks.memoryStore.indexing = false;
	mocks.memoryStore.pending = 0;
});

afterEach(() => {
	vi.useRealTimers();
});

describe('startMemoryAutonomy', () => {
	it('backfills after startup when the index is behind', async () => {
		mocks.memoryStore.pending = 4;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		await vi.advanceTimersByTimeAsync(BACKFILL_MS);

		expect(mocks.refreshCounts).toHaveBeenCalled();
		expect(mocks.buildIndex).toHaveBeenCalledTimes(1);
	});

	it('is a no-op while indexing, so it never races the writer', async () => {
		mocks.memoryStore.pending = 4;
		mocks.memoryStore.indexing = true;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		await vi.advanceTimersByTimeAsync(BACKFILL_MS);

		expect(mocks.buildIndex).not.toHaveBeenCalled();
	});

	it('does nothing when auto re-index is off', async () => {
		mocks.memoryStore.autoIndex = false;
		mocks.memoryStore.pending = 4;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		noteChanged(['a']);
		taskChanged();
		await vi.advanceTimersByTimeAsync(BACKFILL_MS);

		expect(mocks.reindexEntity).not.toHaveBeenCalled();
		expect(mocks.buildIndex).not.toHaveBeenCalled();
	});
});

describe('note changes', () => {
	it('debounces the changed ids into one re-embed pass', async () => {
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		noteChanged(['a', 'b']);
		noteChanged(['a']);

		await vi.advanceTimersByTimeAsync(REINDEX_MS);

		expect(mocks.reindexEntity).toHaveBeenCalledTimes(2);
		expect(mocks.reindexEntity).toHaveBeenCalledWith('note', 'a');
		expect(mocks.reindexEntity).toHaveBeenCalledWith('note', 'b');
	});

	it('falls back to a backfill when the ids are unknown', async () => {
		mocks.memoryStore.pending = 2;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		noteChanged(undefined);
		await vi.advanceTimersByTimeAsync(BACKFILL_MS);

		expect(mocks.reindexEntity).not.toHaveBeenCalled();
		expect(mocks.buildIndex).toHaveBeenCalledTimes(1);
	});
});

describe('settings changes', () => {
	it('backfills after the embedder switches', async () => {
		mocks.memoryStore.pending = 3;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		mocks.handlers.get('memory:changed')?.({ payload: { selected: 'provider:x' } });
		await vi.advanceTimersByTimeAsync(BACKFILL_MS);

		expect(mocks.buildIndex).toHaveBeenCalledTimes(1);
	});
});

describe('the sweep', () => {
	it('rechecks the index on a timer', async () => {
		mocks.memoryStore.pending = 1;
		const { startMemoryAutonomy } = await load();
		await startMemoryAutonomy();

		// The startup pass runs first, then the interval fires again.
		await vi.advanceTimersByTimeAsync(BACKFILL_MS + SWEEP_MS);

		expect(mocks.buildIndex).toHaveBeenCalledTimes(2);
	});
});

describe('stopMemoryAutonomy', () => {
	it('clears the pending timers and the sweep', async () => {
		mocks.memoryStore.pending = 4;
		const { startMemoryAutonomy, stopMemoryAutonomy } = await load();
		await startMemoryAutonomy();
		stopMemoryAutonomy();

		await vi.advanceTimersByTimeAsync(BACKFILL_MS + REINDEX_MS + SWEEP_MS);

		expect(mocks.buildIndex).not.toHaveBeenCalled();
		expect(mocks.unlisten).toHaveBeenCalled();
	});
});
