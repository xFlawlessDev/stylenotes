import { describe, expect, it } from 'vitest';
import {
	GRAPH_TOKENS,
	graphColorHex,
	graphEdgeColor,
	graphNodeColor,
	graphTokenColor,
	parseGraphColor,
	refreshGraphPalette,
	themeClusterColor,
	themeClusterCss,
} from '$lib/components/graph/graph-palette';

describe('graph palette', () => {
	it('parses hex and rgb() values from computed custom properties', () => {
		expect(parseGraphColor('#5484ff')).toBe(0x5484ff);
		expect(parseGraphColor('  #A8C7E8  ')).toBe(0xa8c7e8);
		expect(parseGraphColor('rgb(84, 132, 255)')).toBe(0x5484ff);
		expect(parseGraphColor('rgba(84, 132, 255, 0.5)')).toBe(0x5484ff);
	});

	it('rejects values it cannot read', () => {
		expect(parseGraphColor('')).toBeNull();
		expect(parseGraphColor('not-a-color')).toBeNull();
		expect(parseGraphColor('color-mix(in oklab, red, blue)')).toBeNull();
	});

	it('maps node kinds and task statuses to theme tokens', () => {
		expect(GRAPH_TOKENS.task.doing).toBe('--graph-task-doing');
		expect(GRAPH_TOKENS.task.done).toBe('--graph-task-done');
		expect(GRAPH_TOKENS.edges.dependency).toBe('--graph-edge-dependency');
	});

	it('keeps every node and edge category on a distinct colour', () => {
		refreshGraphPalette();
		const colors = [
			graphNodeColor({ kind: 'note' }),
			graphNodeColor({ kind: 'task', status: 'todo' }),
			graphNodeColor({ kind: 'task', status: 'doing' }),
			graphNodeColor({ kind: 'task', status: 'review' }),
			graphNodeColor({ kind: 'task', status: 'done' }),
			graphEdgeColor('wiki'),
			graphEdgeColor('link'),
			graphEdgeColor('dependency'),
		];
		expect(new Set(colors).size).toBe(colors.length);
	});

	it('resolves without a DOM using the dark fallbacks', () => {
		refreshGraphPalette();
		expect(graphTokenColor('--color-surface')).toBe(0x0e1116);
		expect(graphNodeColor({ kind: 'note' })).toBe(graphTokenColor(GRAPH_TOKENS.note));
		expect(graphEdgeColor('wiki')).toBe(graphTokenColor(GRAPH_TOKENS.edges.wiki));
		expect(graphColorHex(0x0e1116)).toBe('#0e1116');
	});
});

describe('theme cluster colours', () => {
	it('is stable for the same index', () => {
		expect(themeClusterColor(3)).toBe(themeClusterColor(3));
	});

	it('gives adjacent clusters distinct colours', () => {
		const colors = Array.from({ length: 8 }, (_, index) => themeClusterColor(index));
		expect(new Set(colors).size).toBe(colors.length);
	});

	it('returns a valid packed RGB and a matching CSS string', () => {
		const value = themeClusterColor(2);
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThanOrEqual(0xffffff);
		expect(themeClusterCss(2)).toBe(`#${value.toString(16).padStart(6, '0')}`);
	});
});
