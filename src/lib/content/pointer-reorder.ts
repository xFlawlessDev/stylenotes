export type PointerReorderOptions = {
	handleSelector: string;
	idAttribute: string;
	threshold?: number;
	onStart: (id: string) => void;
	onMove: (id: string | null, event: PointerEvent) => void;
	onEnd: (id: string | null, event: PointerEvent) => void;
};

/**
 * Svelte action: pointer-based list reordering.
 *
 * HTML5 drag-and-drop is unavailable while Tauri's native file drop consumes OS
 * drag events, so reordering is tracked with pointer events instead. The element
 * that receives `use:` is the list root; children expose ids via `idAttribute`.
 * A drag starts from the closest ancestor matching `handleSelector` once the
 * pointer moves past `threshold` pixels, and any element under the pointer
 * carrying `idAttribute` becomes the drop target.
 */
export function pointerReorder(node: HTMLElement, options: PointerReorderOptions) {
	let opts = options;
	let candidateId: string | null = null;
	let targetId: string | null = null;
	let dragging = false;
	let pointerId = -1;
	let startX = 0;
	let startY = 0;
	let suppressClickUntil = 0;

	function suppressClick(event: MouseEvent) {
		if (performance.now() >= suppressClickUntil) return;
		event.stopPropagation();
		event.preventDefault();
	}

	function resolveTarget(x: number, y: number): string | null {
		const el = document.elementFromPoint(x, y);
		const target = el?.closest<HTMLElement>(`[${opts.idAttribute}]`);
		const id = target?.getAttribute(opts.idAttribute);
		if (!id || id === candidateId) return null;
		return id;
	}

	function down(event: PointerEvent) {
		if (event.button !== 0) return;
		const handle = (event.target as HTMLElement | null)?.closest(opts.handleSelector);
		const row = handle?.closest<HTMLElement>(`[${opts.idAttribute}]`);
		const id = row?.getAttribute(opts.idAttribute);
		if (!id) return;
		candidateId = id;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
	}

	function move(event: PointerEvent) {
		if (event.pointerId !== pointerId || !candidateId) return;
		if (!dragging) {
			const threshold = opts.threshold ?? 4;
			if (Math.hypot(event.clientX - startX, event.clientY - startY) < threshold) return;
			dragging = true;
			opts.onStart(candidateId);
			event.preventDefault();
		}
		const next = resolveTarget(event.clientX, event.clientY);
		if (next) targetId = next;
		opts.onMove(targetId, event);
	}

	function up(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		if (dragging) {
			suppressClickUntil = performance.now() + 300;
			opts.onEnd(targetId, event);
		}
		candidateId = null;
		targetId = null;
		dragging = false;
		pointerId = -1;
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('click', suppressClick, true);
	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', up);
	window.addEventListener('pointercancel', up);

	return {
		update(next: PointerReorderOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('click', suppressClick, true);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
		},
	};
}