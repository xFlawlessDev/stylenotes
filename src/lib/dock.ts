export type DockEdge = 'left' | 'right' | 'top';

export type DockPoint = { x: number; y: number };
export type DockSize = { width: number; height: number };
export type DockMonitor = { position: DockPoint; size: DockSize };

/** Selectable dock edges, in the order they appear in settings. */
export const DOCK_EDGES: readonly DockEdge[] = ['left', 'right', 'top'];

export const dockEdgeLabels: Record<DockEdge, string> = {
	left: 'Left edge',
	right: 'Right edge',
	top: 'Top edge'
};

/** Rail thickness, shared by every edge (CSS pixels). */
export const DOCK_RAIL = 60;
/** Distance between the rail and the hover card (CSS pixels). */
export const DOCK_CARD_GAP = 52;
/** Expanded overlay window size (CSS pixels). */
export const DOCK_EXPANDED: DockSize = { width: 360, height: 304 };
/** Collapsed tab per edge: one pill shape, rotated to match the edge. */
export const DOCK_COLLAPSED: Record<DockEdge, DockSize> = {
	left: { width: 28, height: 52 },
	right: { width: 28, height: 52 },
	top: { width: 52, height: 28 }
};

/** The screen axis a dock edge runs along, and therefore drags along. */
export function dockAxis(edge: DockEdge): 'x' | 'y' {
	return edge === 'top' ? 'x' : 'y';
}

/** Tooltip side that opens toward the window interior. */
export function dockTooltipSide(edge: DockEdge): 'left' | 'right' | 'bottom' {
	if (edge === 'right') return 'left';
	if (edge === 'left') return 'right';
	return 'bottom';
}

/** Window size for the expanded rail or the collapsed tab on an edge. */
export function dockWindowSize(edge: DockEdge, collapsed: boolean): DockSize {
	return collapsed ? { ...DOCK_COLLAPSED[edge] } : { ...DOCK_EXPANDED };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export type DockSnapInput = {
	edge: DockEdge;
	monitor: DockMonitor;
	/** Physical window size. */
	size: DockSize;
	/** Current physical window position. */
	current: DockPoint;
};

/**
 * Physical position that pins the window to `edge` and keeps it inside the
 * monitor, preserving the free axis so a dragged dock stays where it was left.
 */
export function snapToDockEdge({ edge, monitor, size, current }: DockSnapInput): DockPoint {
	const left = monitor.position.x;
	const top = monitor.position.y;
	const maxX = left + monitor.size.width - size.width;
	const maxY = top + monitor.size.height - size.height;
	if (edge === 'right') return { x: maxX, y: clamp(current.y, top, maxY) };
	if (edge === 'left') return { x: left, y: clamp(current.y, top, maxY) };
	return { x: clamp(current.x, left, maxX), y: top };
}

export type DockCardInput = {
	edge: DockEdge;
	/** Hovered rail button center, in window-local CSS pixels. */
	pointer: DockPoint;
	/** Window size in CSS pixels. */
	window: DockSize;
	/** Card size in CSS pixels. */
	card: DockSize;
	gap?: number;
	margin?: number;
};

/** Window-local CSS offset for the hover card attached to the rail. */
export function dockCardOffset({
	edge,
	pointer,
	window,
	card,
	gap = DOCK_CARD_GAP,
	margin = 8
}: DockCardInput): DockPoint {
	if (edge === 'top') {
		return {
			x: clamp(pointer.x - card.width / 2, margin, window.width - card.width - margin),
			y: gap
		};
	}
	return {
		x: edge === 'right' ? window.width - gap - card.width : gap,
		y: clamp(pointer.y - card.height / 2, margin, window.height - card.height - margin)
	};
}
