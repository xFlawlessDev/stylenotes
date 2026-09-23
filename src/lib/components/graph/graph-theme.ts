import type { GraphEdgeKind } from '$lib/content/workspace-graph';
import type { TaskStatus } from '$lib/stores/tasks';

export type GraphTheme = {
	note: number;
	task: Record<TaskStatus, number>;
	label: number;
	labelStroke: number;
	highlight: number;
	edges: Record<GraphEdgeKind, number>;
};

const FALLBACK: GraphTheme = {
	note: 0xa8c7e8,
	task: { todo: 0x6f7f92, doing: 0x8fa6bd, review: 0x9ec9c4, done: 0xa8c7e8 },
	label: 0xdce3ee,
	labelStroke: 0x0e1116,
	highlight: 0xe0a3a0,
	edges: { wiki: 0xa8c7e8, dependency: 0x8fa6bd, link: 0x9ec9c4 },
};

/** Reads the active Material 3 tokens so the canvas follows the app theme. */
export function readGraphTheme(element: HTMLElement): GraphTheme {
	const styles = getComputedStyle(element);
	const token = (name: string, fallback: number) => hexToNumber(styles.getPropertyValue(name).trim()) ?? fallback;
	return {
		note: token('--color-primary', FALLBACK.note),
		task: {
			todo: token('--color-outline', FALLBACK.task.todo),
			doing: token('--color-secondary', FALLBACK.task.doing),
			review: token('--color-tertiary', FALLBACK.task.review),
			done: token('--color-primary', FALLBACK.task.done),
		},
		label: token('--color-on-surface', FALLBACK.label),
		labelStroke: token('--color-surface', FALLBACK.labelStroke),
		highlight: token('--color-error', FALLBACK.highlight),
		edges: {
			wiki: token('--color-primary', FALLBACK.edges.wiki),
			dependency: token('--color-secondary', FALLBACK.edges.dependency),
			link: token('--color-tertiary', FALLBACK.edges.link),
		},
	};
}

function hexToNumber(value: string): number | null {
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
	if (!match) return null;
	const hex = match[1].length === 3 ? [...match[1]].map((char) => char + char).join('') : match[1];
	return Number.parseInt(hex, 16);
}
