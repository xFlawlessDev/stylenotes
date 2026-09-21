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

/**
 * Debounced writer for the note/task detail windows: coalesces rapid edits,
 * exposes a saving/failed status, and can be flushed before the window closes.
 */
export function createSaveQueue<T>(
	save: (value: T) => Promise<boolean>,
	delay = 300
): SaveQueue<T> {
	const state = $state<SaveQueueState>({ saving: false, failed: false, dirty: false });
	let pending: { value: T } | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inflight: Promise<void> | null = null;
	let token = 0;

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
			const run = save(item.value);
			inflight = run.then(() => undefined);
			const ok = await run;
			if (current === token) {
				state.saving = false;
				state.failed = !ok;
				state.dirty = pending !== null;
			}
		}
		if (inflight) await inflight;
	}

	function enqueue(value: T) {
		pending = { value };
		state.dirty = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			void flush();
		}, delay);
	}

	return { state, enqueue, flush };
}
