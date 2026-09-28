export type SaveQueueState = {
	saving: boolean;
	failed: boolean;
	dirty: boolean;
};

export type SaveQueue<T> = {
	state: SaveQueueState;
	enqueue: (value: T) => void;
	flush: () => Promise<void>;
};

export type SaveQueueOptions = {
	/** Idle debounce: how long typing must pause before a write is considered. */
	delay?: number;
	/**
	 * Minimum time between two writes to the database. A burst of keystrokes
	 * coalesces in memory and only touches SQLite this often, even while the
	 * user keeps typing. `flush()` ignores it.
	 */
	minGap?: number;
};

/**
 * Debounced writer for the note/task detail windows: coalesces rapid edits,
 * exposes a saving/failed status, and can be flushed before the window closes.
 *
 * Two tiers keep the database calm: `delay` settles a burst of edits, then
 * `minGap` limits how often the settled value is actually written when edits
 * keep arriving. Only the newest value is ever written.
 */
export function createSaveQueue<T>(
	save: (value: T) => Promise<boolean>,
	options: SaveQueueOptions | number = {}
): SaveQueue<T> {
	const { delay = 300, minGap = 2500 } =
		typeof options === 'number' ? { delay: options, minGap: 0 } : options;
	const state = $state<SaveQueueState>({ saving: false, failed: false, dirty: false });
	let pending: { value: T } | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inflight: Promise<void> | null = null;
	let token = 0;
	let lastWrite = Number.NEGATIVE_INFINITY;

	/** Schedules a write at the later of the idle debounce and the gap floor. */
	function schedule() {
		if (timer) clearTimeout(timer);
		// No write yet this session: honor only the idle debounce, so the first
		// save after opening a note is never artificially delayed.
		const gap = Number.isFinite(lastWrite)
			? Math.max(0, lastWrite + minGap - Date.now())
			: 0;
		timer = setTimeout(() => {
			timer = undefined;
			void flush();
		}, Math.max(delay, gap));
	}

	async function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		const item = pending;
		if (item) {
			pending = null;
			const current = ++token;
			state.saving = true;
			lastWrite = Date.now();
			const run = save(item.value);
			inflight = run.then(() => undefined);
			const ok = await run;
			if (current === token) {
				state.saving = false;
				state.failed = !ok;
				state.dirty = pending !== null;
				// A value that queued while this write was in flight must still
				// respect the gap, so re-schedule instead of writing at once.
				if (pending) schedule();
			}
		}
		if (inflight) await inflight;
	}

	function enqueue(value: T) {
		pending = { value };
		state.dirty = true;
		schedule();
	}

	return { state, enqueue, flush };
}
