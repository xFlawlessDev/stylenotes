import { describe, expect, it } from 'vitest';
import {
	DOCK_CARD_GAP,
	DOCK_CARD_MARGIN,
	DOCK_EDGES,
	DOCK_EXPANDED,
	DOCK_MIN_LENGTH,
	DOCK_RAIL_INSET,
	dockAxis,
	dockCardOffset,
	dockEdgeLabels,
	dockItemBar,
	dockOverlayMinLength,
	dockTooltipSide,
	dockWindowLength,
	dockWindowSize,
	fitDockWindow,
	snapToDockEdge
} from './dock';

const monitor = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } };
const window = { width: 360, height: 304 };
const card = { width: 288, height: 280 };

describe('DOCK_EDGES', () => {
	it('lists every edge with a label', () => {
		expect(DOCK_EDGES).toEqual(['left', 'right', 'top']);
		for (const edge of DOCK_EDGES) expect(dockEdgeLabels[edge]).toBeTruthy();
	});
});

describe('dockAxis', () => {
	it('drags vertically on side edges and horizontally on the top edge', () => {
		expect(dockAxis('left')).toBe('y');
		expect(dockAxis('right')).toBe('y');
		expect(dockAxis('top')).toBe('x');
	});
});

describe('dockTooltipSide', () => {
	it('opens tooltips toward the screen interior', () => {
		expect(dockTooltipSide('right')).toBe('left');
		expect(dockTooltipSide('left')).toBe('right');
		expect(dockTooltipSide('top')).toBe('bottom');
	});
});

describe('dockWindowSize', () => {
	it('uses the expanded window when the rail is open', () => {
		expect(dockWindowSize('left', false)).toEqual({ ...DOCK_EXPANDED });
		expect(dockWindowSize('top', false)).toEqual({ ...DOCK_EXPANDED });
	});

	it('shrinks to a matching pill against side edges', () => {
		expect(dockWindowSize('left', true)).toEqual({ width: 28, height: 52 });
		expect(dockWindowSize('right', true)).toEqual({ width: 28, height: 52 });
	});

	it('shrinks to the same pill rotated against the top edge', () => {
		expect(dockWindowSize('top', true)).toEqual({ width: 52, height: 28 });
	});
});

describe('fitDockWindow', () => {
	it('fits the top edge width to the measured content', () => {
		expect(fitDockWindow('top', 204)).toEqual({ width: 204, height: DOCK_EXPANDED.height });
	});

	it('fits side edges height to the measured content', () => {
		expect(fitDockWindow('left', 172)).toEqual({ width: DOCK_EXPANDED.width, height: 172 });
		expect(fitDockWindow('right', 172)).toEqual({ width: DOCK_EXPANDED.width, height: 172 });
	});

	it('keeps the thickness axis at the expanded rail size', () => {
		expect(fitDockWindow('top', 204).height).toBe(DOCK_EXPANDED.height);
		expect(fitDockWindow('left', 172).width).toBe(DOCK_EXPANDED.width);
	});

	it('clamps short content up to the minimum length', () => {
		expect(fitDockWindow('top', 40).width).toBe(DOCK_MIN_LENGTH);
		expect(fitDockWindow('right', 12).height).toBe(DOCK_MIN_LENGTH);
	});

	it('clamps long content to the expanded window cap', () => {
		expect(fitDockWindow('top', 9999).width).toBe(DOCK_EXPANDED.width);
		expect(fitDockWindow('left', 9999).height).toBe(DOCK_EXPANDED.height);
	});

	it('falls back to the cap before layout has run', () => {
		expect(fitDockWindow('top', 0)).toEqual({ ...DOCK_EXPANDED });
	});

	it('grows past the default minimum when an overlay needs the room', () => {
		const min = dockOverlayMinLength(288);
		expect(fitDockWindow('top', 150, min).width).toBe(min);
	});

	it('never exceeds the expanded cap even for a wide overlay', () => {
		expect(fitDockWindow('top', 9999, dockOverlayMinLength(9999)).width).toBe(DOCK_EXPANDED.width);
	});
});

describe('dockOverlayMinLength', () => {
	it('keeps a card margin on both sides of the overlay', () => {
		expect(dockOverlayMinLength(288)).toBe(288 + 2 * DOCK_CARD_MARGIN);
	});
});

describe('dockWindowLength', () => {
	it('adds the rail inset for side edges so the rail bottom is not clipped', () => {
		expect(dockWindowLength('left', 300)).toBe(300 + DOCK_RAIL_INSET);
		expect(dockWindowLength('right', 300)).toBe(300 + DOCK_RAIL_INSET);
	});

	it('uses the rail length directly for the flush top edge', () => {
		expect(dockWindowLength('top', 300)).toBe(300);
	});
});

describe('snapToDockEdge', () => {
	it('pins the right edge and keeps the dragged vertical position', () => {
		expect(
			snapToDockEdge({ edge: 'right', monitor, size: window, current: { x: 400, y: 300 } })
		).toEqual({ x: 1560, y: 300 });
	});

	it('pins the left edge and keeps the dragged vertical position', () => {
		expect(
			snapToDockEdge({ edge: 'left', monitor, size: window, current: { x: 400, y: 300 } })
		).toEqual({ x: 0, y: 300 });
	});

	it('pins the top edge and keeps the dragged horizontal position', () => {
		expect(
			snapToDockEdge({ edge: 'top', monitor, size: window, current: { x: 700, y: 500 } })
		).toEqual({ x: 700, y: 0 });
	});

	it('clamps the free axis inside the monitor', () => {
		expect(
			snapToDockEdge({ edge: 'right', monitor, size: window, current: { x: 0, y: 9999 } })
		).toEqual({ x: 1560, y: 776 });
		expect(
			snapToDockEdge({ edge: 'top', monitor, size: window, current: { x: 9999, y: 0 } })
		).toEqual({ x: 1560, y: 0 });
	});

	it('respects a monitor that is not at the origin', () => {
		const secondary = { position: { x: -1080, y: 40 }, size: { width: 1080, height: 800 } };
		expect(
			snapToDockEdge({
				edge: 'left',
				monitor: secondary,
				size: window,
				current: { x: 0, y: 9999 }
			})
		).toEqual({ x: -1080, y: 536 });
	});
});

describe('dockCardOffset', () => {
	it('places the card inward from a right-edge rail', () => {
		expect(
			dockCardOffset({ edge: 'right', pointer: { x: 30, y: 150 }, window, card })
		).toEqual({ x: window.width - DOCK_CARD_GAP - card.width, y: 10 });
	});

	it('places the card inward from a left-edge rail', () => {
		expect(dockCardOffset({ edge: 'left', pointer: { x: 30, y: 150 }, window, card })).toEqual({
			x: DOCK_CARD_GAP,
			y: 10
		});
	});

	it('places the card below a top-edge rail and follows the button', () => {
		expect(dockCardOffset({ edge: 'top', pointer: { x: 150, y: 30 }, window, card })).toEqual({
			x: 8,
			y: DOCK_CARD_GAP
		});
	});

	it('clamps the card inside the window', () => {
		expect(
			dockCardOffset({ edge: 'right', pointer: { x: 30, y: 9999 }, window, card }).y
		).toBe(window.height - card.height - 8);
		expect(
			dockCardOffset({ edge: 'top', pointer: { x: 9999, y: 30 }, window, card }).x
		).toBe(window.width - card.width - 8);
	});
});

describe('dockItemBar', () => {
	it('runs along the window interior edge for side rails', () => {
		expect(dockItemBar('left', false)).toContain('left-0');
		expect(dockItemBar('right', false)).toContain('right-0');
		expect(dockItemBar('left', false)).toContain('h-7');
	});

	it('grows toward the interior when the item is active', () => {
		expect(dockItemBar('left', true)).toContain('h-8');
		expect(dockItemBar('left', true)).toContain('top-0.5');
		expect(dockItemBar('left', false)).toContain('top-1');
	});

	it('rotates the bar for a top-edge rail', () => {
		expect(dockItemBar('top', true)).toContain('bottom-0');
		expect(dockItemBar('top', true)).toContain('w-8');
		expect(dockItemBar('top', false)).toContain('left-1');
	});
});
