import { describe, expect, it } from 'vitest';
import {
	clampScale,
	fitView,
	formatZoom,
	normalizeView,
	panBy,
	zoomAt,
	zoomTo,
	MERMAID_MAX_SCALE,
	MERMAID_MIN_SCALE,
} from '$lib/content/mermaid-view';

describe('mermaid view maths', () => {
	it('clamps the scale to the supported range', () => {
		expect(clampScale(50)).toBe(MERMAID_MAX_SCALE);
		expect(clampScale(0)).toBe(MERMAID_MIN_SCALE);
		expect(clampScale(Number.NaN)).toBe(1);
		expect(clampScale(1.5)).toBe(1.5);
	});

	it('keeps the point under the cursor fixed while zooming', () => {
		const view = { scale: 1, x: 20, y: -10 };
		const zoomed = zoomAt(view, 2, 100, 50);
		// Screen position of the diagram point that was under (100, 50) is unchanged.
		expect(zoomed.scale).toBe(2);
		expect((100 - view.x) / view.scale).toBeCloseTo((100 - zoomed.x) / zoomed.scale);
		expect((50 - view.y) / view.scale).toBeCloseTo((50 - zoomed.y) / zoomed.scale);
	});

	it('does not overshoot the scale limits when zooming', () => {
		const view = { scale: MERMAID_MAX_SCALE, x: 0, y: 0 };
		expect(zoomAt(view, 2, 0, 0).scale).toBe(MERMAID_MAX_SCALE);
	});

	it('zooms to an absolute scale relative to the current view', () => {
		const view = { scale: 2, x: 10, y: 10 };
		const next = zoomTo(view, 1, 0, 0);
		expect(next.scale).toBe(1);
		expect(next.x).toBe(5);
		expect(next.y).toBe(5);
	});

	it('pans without changing the scale', () => {
		const moved = panBy({ scale: 1.5, x: 0, y: 0 }, 12, -8);
		expect(moved).toEqual({ scale: 1.5, x: 12, y: -8 });
	});

	it('fits and centres content inside the viewport', () => {
		const view = fitView(400, 300, 200, 100, 0);
		expect(view.scale).toBe(2);
		expect(view.x).toBe(0);
		expect(view.y).toBe(50);
	});

	it('falls back to the identity view on unmeasured rectangles', () => {
		expect(fitView(0, 0, 100, 100)).toEqual({ scale: 1, x: 0, y: 0 });
	});

	it('normalizes non-finite pan offsets', () => {
		expect(normalizeView({ scale: 1, x: Number.NaN, y: Infinity })).toEqual({
			scale: 1,
			x: 0,
			y: 0,
		});
	});

	it('formats the zoom as a rounded percentage', () => {
		expect(formatZoom(1)).toBe('100%');
		expect(formatZoom(0.333)).toBe('33%');
	});
});
