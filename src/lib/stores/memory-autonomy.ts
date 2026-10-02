/**
 * Background index maintenance for semantic memory (#D16, #D17).
 *
 * The index is a derivative (#D6), so nothing here is ever the only copy of a
 * vector — but a stale index quietly degrades every semantic read. This module
 * keeps it fresh on its own when `autoIndex` is on:
 *
 * - a changed note is re-embedded after a short debounce (the `changedIds` the
 *   note store already publishes, so a burst of typing is one pass);
 * - tasks, which publish no ids, and any startup/wake-up gap trigger a
 *   debounced backfill (only stale rows are touched, by `content_hash`);
 * - a slow sweep rechecks on a timer, catching anything an event missed
 *   (vault imports, external writes, a provider that failed once).
 *
 * Only the `workspace` window runs this, exactly like the index build itself
 * (#D16): it owns the timers and the one writer, and reads the preference from
 * the shared store on every tick so the Settings switch takes effect without a
 * second event. A failure is never thrown into the UI — the next sweep retries.
 */

import { browser } from '$app/environment';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
	MEMORY_AUTONOMY_BACKFILL_DELAY_MS,
	MEMORY_AUTONOMY_INTERVAL_MS,
	MEMORY_AUTONOMY_REINDEX_DELAY_MS
} from '$lib/content/memory-types';
import { NOTES_CHANGED, type NotesChangedPayload } from '$lib/stores/notes';
import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
import {
	buildIndex,
	MEMORY_CHANGED,
	memoryReady,
	memoryStore,
	refreshCounts,
	reindexEntity
} from '$lib/stores/memory.svelte';
import { currentWindowRole, isTauri } from '$lib/windows';

let started = false;
let notesUnlisten: UnlistenFn | undefined;
let tasksUnlisten: UnlistenFn | undefined;
let changedUnlisten: UnlistenFn | undefined;
let reindexTimer: ReturnType<typeof setTimeout> | null = null;
let backfillTimer: ReturnType<typeof setTimeout> | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Note ids seen since the last re-embed pass, deduped. */
const pendingNoteIds = new Set<string>();

/**
 * Starts the background upkeep. Idempotent, and a no-op outside Tauri or in a
 * non-workspace window, which never owns the index writer (#D16).
 */
export async function startMemoryAutonomy(): Promise<void> {
	if (started || !browser || !isTauri) return;
	if (currentWindowRole() !== 'workspace') return;
	started = true;
	[notesUnlisten, tasksUnlisten, changedUnlisten] = await Promise.all([
		listen<NotesChangedPayload>(NOTES_CHANGED, (event) => collectNotes(event.payload?.changedIds)),
		listen(TASKS_CHANGED, () => scheduleBackfill()),
		// A settings change — a new embedder, auto re-index switched back on —
		// can leave the index empty, so worth a pass. A no-op otherwise.
		listen(MEMORY_CHANGED, () => scheduleBackfill())
	]);
	// Give the app a moment to settle, then catch up on whatever changed while
	// it was closed. The delayed pass is what makes "turn memory on and walk
	// away" actually finish the first index (#D17).
	scheduleBackfill(MEMORY_AUTONOMY_BACKFILL_DELAY_MS);
	sweepTimer = setInterval(() => scheduleBackfill(), MEMORY_AUTONOMY_INTERVAL_MS);
}

export function stopMemoryAutonomy(): void {
	notesUnlisten?.();
	tasksUnlisten?.();
	changedUnlisten?.();
	notesUnlisten = undefined;
	tasksUnlisten = undefined;
	changedUnlisten = undefined;
	if (reindexTimer) clearTimeout(reindexTimer);
	if (backfillTimer) clearTimeout(backfillTimer);
	if (sweepTimer) clearInterval(sweepTimer);
	reindexTimer = null;
	backfillTimer = null;
	sweepTimer = null;
	pendingNoteIds.clear();
	started = false;
}

/** Queues the changed note ids and arms the debounce. */
function collectNotes(ids: string[] | undefined): void {
	if (!memoryStore.autoIndex) return;
	// A caller that cannot name the changed notes (a bulk replace) omits the
	// ids; fall back to a backfill, which compares content hashes and touches
	// only what actually moved.
	if (!ids?.length) {
		scheduleBackfill();
		return;
	}
	for (const id of ids) pendingNoteIds.add(id);
	scheduleReindex();
}

function scheduleReindex(): void {
	if (reindexTimer) clearTimeout(reindexTimer);
	reindexTimer = setTimeout(() => {
		reindexTimer = null;
		const ids = [...pendingNoteIds];
		pendingNoteIds.clear();
		void runReindex(ids);
	}, MEMORY_AUTONOMY_REINDEX_DELAY_MS);
}

/**
 * Re-embeds the notes that changed. Skipped entirely while a full build owns
 * the writer; the next sweep re-reads the sources and picks up anything that
 * moved during the build, so nothing is lost by waiting.
 */
async function runReindex(ids: string[]): Promise<void> {
	if (!memoryStore.autoIndex || memoryStore.indexing || !memoryReady()) return;
	for (const id of ids) {
		try {
			await reindexEntity('note', id);
		} catch {
			// A single failure is retried by the sweep; not worth a red error.
		}
	}
}

/** Arms the debounced backfill, coalescing a burst of triggers into one run. */
function scheduleBackfill(delay = MEMORY_AUTONOMY_BACKFILL_DELAY_MS): void {
	if (backfillTimer) clearTimeout(backfillTimer);
	backfillTimer = setTimeout(() => {
		backfillTimer = null;
		void runBackfill();
	}, delay);
}

/**
 * Builds the index if it is behind. `buildIndex` re-embeds only the rows whose
 * `content_hash` changed, so a sweep after a quiet stretch is a cheap no-op;
 * recomputing the counts first is what tells us whether there is any work.
 */
async function runBackfill(): Promise<void> {
	if (!memoryStore.autoIndex || memoryStore.indexing || !memoryReady()) return;
	try {
		await refreshCounts();
		if (memoryStore.pending <= 0) return;
		await buildIndex();
	} catch {
		// Surfaced on the next status refresh, not thrown at the UI.
	}
}
