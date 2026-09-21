import { describe, expect, it } from 'vitest';
import {
	DOCK_CARD_GAP,
	DOCK_EDGES,
	dockAxis,
	dockCardOffset,
	dockEdgeLabels,
	dockItemBar,
	dockTooltipSide,
	dockWindowSize,
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
		expect(dockWindowSize('left', false)).toEqual({ width: 360, height: 304 });
		expect(dockWindowSize('top', false)).toEqual({ width: 360, height: 304 });
	});

	it('shrinks to a matching pill against side edges', () => {
		expect(dockWindowSize('left', true)).toEqual({ width: 28, height: 52 });
		expect(dockWindowSize('right', true)).toEqual({ width: 28, height: 52 });
	});

	it('shrinks to the same pill rotated against the top edge', () => {
		expect(dockWindowSize('top', true)).toEqual({ width: 52, height: 28 });
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
