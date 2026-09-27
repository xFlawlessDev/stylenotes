import type { Note } from '$lib/content/content';
import type { Task } from '$lib/stores/tasks';

export type DockEdge = 'left' | 'right' | 'top';

/** A dock rail item under the pointer: a docked note or task. */
export type DockHover = { kind: 'task'; task: Task } | { kind: 'note'; note: Note };

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
/**
 * Free-axis inset the rail keeps from the window start on side edges
 * (`top-3`), so the window has to be this much longer than the rail itself.
 */
export const DOCK_RAIL_INSET = 12;
/** Distance between the rail and the hover card (CSS pixels). */
export const DOCK_CARD_GAP = 52;
/** Breathing room kept between a card/menu and the window edge (CSS pixels). */
export const DOCK_CARD_MARGIN = 8;
/** Largest expanded overlay window per edge (CSS pixels). Matches the
 * `overlay` window caps in `tauri.conf.json`; the window actually shrinks to
 * the measured rail on the free axis (see `fitDockWindow`).
 */
export const DOCK_EXPANDED: DockSize = { width: 360, height: 320 };
/**
 * Smallest expanded window on the free axis, so a short rail still reads as a
 * rail instead of collapsing to a dot (CSS pixels). A hover card is wider than
 * this; the window is grown to fit one while it is open (see `fitDockWindow`).
 */
export const DOCK_MIN_LENGTH = 132;
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

/**
 * Window size for an expanded rail, fitted to the measured content.
 *
 * The rail runs along one axis and fills the window on the other (thickness),
 * so only the length axis is measured: the top edge is as wide as its items
 * the side edges as tall as theirs. `min` raises the floor while a hover card
 * is open, so the card is never clipped; the `DOCK_EXPANDED` cap (which mirrors
 * the `maxWidth`/`maxHeight` in `tauri.conf.json`) always wins. A non-positive
 * measurement falls back to the cap, which is what a rail measures before
 * layout has run.
 */
export function fitDockWindow(
	edge: DockEdge,
	content: number,
	min: number = DOCK_MIN_LENGTH
): DockSize {
	const cap = edge === 'top' ? DOCK_EXPANDED.width : DOCK_EXPANDED.height;
	const length = content > 0 ? clamp(content, Math.min(min, cap), cap) : cap;
	return edge === 'top'
		? { width: length, height: DOCK_EXPANDED.height }
		: { width: DOCK_EXPANDED.width, height: length };
}

/**
 * Window free-axis length needed to show a rail of `railLength` pixels.
 *
 * The rail runs from `DOCK_RAIL_INSET` inside the window on side edges (the
 * `top-3` offset), so the window has to be that much longer or the rail bottom
 * would be clipped, taking the `+` button with it. The top edge sits flush at
 * the window start and needs no inset.
 */
export function dockWindowLength(edge: DockEdge, railLength: number): number {
	return edge === 'top' ? railLength : railLength + DOCK_RAIL_INSET;
}

/**
 * Free-axis length an open overlay needs so it is not clipped by the window.
 *
 * A hover card or capture menu is anchored to a rail item, which can sit
 * anywhere along the rail; the window has to be long enough to hold it plus the
 * margin on both sides. The card is wider than the rail is long, so this is
 * only the floor for a dock that shrank to its content.
 */
export function dockOverlayMinLength(overlay: number): number {
	return overlay + 2 * DOCK_CARD_MARGIN;
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
	margin = DOCK_CARD_MARGIN
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

/**
 * Edge-facing indicator bar for a dock item button (task priority or note
 * pin); `active` grows the bar toward the window interior.
 */
export function dockItemBar(edge: DockEdge, active: boolean): string {
	if (edge === 'top') {
		return `absolute bottom-0 rounded-t ${active ? 'left-0.5 h-1.5 w-8' : 'left-1 h-1 w-7'}`;
	}
	const side = edge === 'right' ? 'right-0 rounded-l' : 'left-0 rounded-r';
	return `absolute ${side} ${active ? 'top-0.5 h-8 w-1.5' : 'top-1 h-7 w-1'}`;
}
