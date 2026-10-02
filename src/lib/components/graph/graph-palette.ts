import type { GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import type { TaskStatus } from '$lib/stores/tasks';

/**
 * Graph palette driven by the workspace theme.
 *
 * The Pixi canvas and the Svelte overlays share one source of truth: every
 * colour resolves to a CSS custom property on `:root`, so the graph follows the
 * active mode (light/dark) and accent instead of sitting on its own dark scene.
 * Values are cached per theme revision and re-resolved when the theme changes.
 */

/** CSS custom property each graph element reads from. */
export const GRAPH_TOKENS = {
	background: '--color-surface',
	label: '--color-on-surface',
	labelStroke: '--color-surface',
	note: '--graph-note',
	task: {
		backlog: '--graph-task-backlog',
		todo: '--graph-task-todo',
		doing: '--graph-task-doing',
		review: '--graph-task-review',
		done: '--graph-task-done',
	} as Record<TaskStatus, string>,
	edges: {
		wiki: '--graph-edge-wiki',
		link: '--graph-edge-link',
		dependency: '--graph-edge-dependency',
		semantic: '--graph-edge-semantic',
		related: '--graph-edge-related',
		contradicts: '--graph-edge-contradicts',
	} as Record<GraphEdgeKind, string>,
} as const;

export type GraphColorKey = string;

/** Hard fallbacks for the dark theme, used before the DOM is available. */
const FALLBACK: Record<string, number> = {
	'--color-surface': 0x0e1116,
	'--color-on-surface': 0xdce3ee,
	'--graph-note': 0x6f9dff,
	'--graph-task-backlog': 0x5a6478,
	'--graph-task-todo': 0x8b98ab,
	'--graph-task-doing': 0x4fd0d8,
	'--graph-task-review': 0xf0a44b,
	'--graph-task-done': 0x6fdc8c,
	'--graph-edge-wiki': 0x7f8ea3,
	'--graph-edge-link': 0x4a9ff5,
	'--graph-edge-dependency': 0xe5698f,
	'--graph-edge-semantic': 0xb39ddb,
	'--graph-edge-related': 0x90caf9,
	'--graph-edge-contradicts': 0xff8a65,
};

export const GRAPH_EDGE_LABELS: Record<GraphEdgeKind, string> = {
	wiki: 'Wiki link',
	link: 'Linked note',
	dependency: 'Dependency',
	semantic: 'Similar',
	related: 'Related',
	contradicts: 'Contradicts',
};

let cached: Map<string, number> | null = null;
let cachedKey = '';

/** Theme signature straight from the DOM: mode class + accent attribute. */
function themeKey(): string {
	if (typeof document === 'undefined') return 'default';
	const html = document.documentElement;
	return `${html.classList.contains('light') ? 'light' : 'dark'}:${html.dataset.accent ?? 'steel'}`;
}

/** Accepts `#rrggbb` and `rgb(r, g, b)` — what computed custom properties return. */
export function parseGraphColor(value: string): number | null {
	const hex = value.trim().replace(/^#/, '');
	if (/^[0-9a-f]{6}$/i.test(hex)) return Number.parseInt(hex, 16);
	const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
	if (!match) return null;
	const [r, g, b] = match.slice(1, 4).map((channel) => Math.round(Number(channel)));
	if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
	return (r << 16) | (g << 8) | b;
}

function resolve(token: string): number {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return FALLBACK[token] ?? FALLBACK['--color-on-surface'];
	}
	const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
	const parsed = parseGraphColor(raw);
	if (parsed !== null) return parsed;
	return FALLBACK[token] ?? FALLBACK['--color-on-surface'];
}

/**
 * Re-resolve every token against the current theme. Called automatically when
 * the mode/accent changes; call directly only after forcing a style flush.
 */
export function refreshGraphPalette() {
	cachedKey = themeKey();
	cached = new Map(tokenList().map((token) => [token, resolve(token)]));
}

function tokenList(): GraphColorKey[] {
	return [
		GRAPH_TOKENS.background,
		GRAPH_TOKENS.label,
		GRAPH_TOKENS.labelStroke,
		GRAPH_TOKENS.note,
		...Object.values(GRAPH_TOKENS.task),
		...Object.values(GRAPH_TOKENS.edges),
	];
}

/** Numeric colour for a CSS token, resolved against the workspace theme. */
export function graphTokenColor(token: GraphColorKey): number {
	if (!cached || cachedKey !== themeKey()) refreshGraphPalette();
	return cached?.get(token) ?? resolve(token);
}

export function graphNodeColor(node: Pick<GraphNode, 'kind' | 'status'>): number {
	return node.kind === 'note'
		? graphTokenColor(GRAPH_TOKENS.note)
		: graphTokenColor(GRAPH_TOKENS.task[node.status ?? 'todo']);
}

/**
 * A stable colour for a theme cluster, returned as a packed `0xrrggbb`.
 *
 * One definition shared by the legend and the canvas override, so the swatch a
 * user clicks is exactly the colour the nodes take. Hue steps by the golden
 * angle so adjacent clusters never land on near-identical hues.
 */
export function themeClusterColor(index: number): number {
	const hue = (index * 137.508) % 360;
	// HSL(62% saturation, 60% lightness) converted to sRGB keeps the clusters
	// legible on both the dark and light graph background.
	const hsl = hueToRgb(hue, 0.62, 0.6);
	return (Math.round(hsl[0] * 255) << 16) | (Math.round(hsl[1] * 255) << 8) | Math.round(hsl[2] * 255);
}

/** The same theme colour as a CSS string, for inline styles in Svelte. */
export function themeClusterCss(index: number): string {
	return graphColorHex(themeClusterColor(index));
}

/** Standard HSL-to-RGB, all inputs in 0..1 except hue in degrees. */
function hueToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
	const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const h = hue / 60;
	const x = c * (1 - Math.abs((h % 2) - 1));
	let rgb: [number, number, number];
	if (h < 1) rgb = [c, x, 0];
	else if (h < 2) rgb = [x, c, 0];
	else if (h < 3) rgb = [0, c, x];
	else if (h < 4) rgb = [0, x, c];
	else if (h < 5) rgb = [x, 0, c];
	else rgb = [c, 0, x];
	const m = lightness - c / 2;
	return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

export function graphEdgeColor(kind: GraphEdgeKind): number {
  return graphTokenColor(GRAPH_TOKENS.edges[kind]);
}

export function graphColorHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Convenience: token → `#rrggbb` for inline styles in Svelte overlays. */
export function graphTokenHex(token: GraphColorKey): string {
  return graphColorHex(graphTokenColor(token));
}