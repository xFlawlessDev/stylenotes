import { taskBar, type Task, type TaskDependency, type TimelineRange } from '$lib/stores/tasks';

/** Every Gantt row is laid out at this exact height so the dependency overlay can be positioned. */
export const GANTT_ROW_HEIGHT = 52;

/** Readable bounds for the fluid day column width. */
export const GANTT_MIN_DAY_WIDTH = 18;
export const GANTT_MAX_DAY_WIDTH = 36;
export const GANTT_DEFAULT_DAY_WIDTH = 30;

/**
 * Picks a day column width so the timeline fits `available` px when it can,
 * clamped to readable bounds. When the timeline still does not fit, the panel
 * scrolls horizontally instead of widening the window.
 */
export function ganttDayWidth(available: number, days: number): number {
	if (!Number.isFinite(available) || days <= 0) return GANTT_DEFAULT_DAY_WIDTH;
	const fitted = (available - 2) / days;
	return Math.floor(Math.min(GANTT_MAX_DAY_WIDTH, Math.max(GANTT_MIN_DAY_WIDTH, fitted)));
}

export type GanttDependencyLink = {
	/** Stable id for keyed rendering: `dependsOn -> task`. */
	id: string;
	taskId: string;
	dependsOnTaskId: string;
	/** True while either side is still open, i.e. the dependency has not been satisfied yet. */
	open: boolean;
	/** SVG path in timeline coordinates, drawn from the predecessor to the dependent. */
	path: string;
};

type GanttLinkOptions = {
	dayWidth: number;
	rowHeight?: number;
};

/**
 * Builds the arrows that connect dependency bars on the Gantt timeline.
 *
 * Only dependencies whose two tasks both have a bar in `rows` produce a link,
 * and the order of `rows` defines the vertical position of each link.
 */
export function ganttDependencyLinks(
	rows: Task[],
	range: TimelineRange,
	dependencies: TaskDependency[],
	opts: GanttLinkOptions
): GanttDependencyLink[] {
	const rowHeight = opts.rowHeight ?? GANTT_ROW_HEIGHT;
	const placements = new Map<string, { task: Task; offset: number; span: number; row: number }>();
	rows.forEach((task, row) => {
		const bar = taskBar(task, range);
		if (bar) placements.set(task.id, { task, offset: bar.offset, span: bar.span, row });
	});

	const links: GanttDependencyLink[] = [];
	for (const dependency of dependencies) {
		const from = placements.get(dependency.dependsOnTaskId);
		const to = placements.get(dependency.taskId);
		if (!from || !to) continue;

		const x1 = (from.offset + from.span) * opts.dayWidth - 1;
		const y1 = from.row * rowHeight + rowHeight / 2;
		const x2 = to.offset * opts.dayWidth + 1;
		const y2 = to.row * rowHeight + rowHeight / 2;
		const curve = Math.min(48, Math.max(16, Math.abs(x2 - x1) / 2));

		links.push({
			id: `${dependency.dependsOnTaskId}->${dependency.taskId}`,
			taskId: dependency.taskId,
			dependsOnTaskId: dependency.dependsOnTaskId,
			open: !from.task.completed && !to.task.completed,
			path: `M ${x1} ${y1} C ${x1 + curve} ${y1} ${x2 - curve} ${y2} ${x2} ${y2}`
		});
	}
	return links;
}

/** Ids of the links that touch `taskId`, so the selected row's dependencies can stand out. */
export function ganttLinksForTask(links: GanttDependencyLink[], taskId: string): Set<string> {
	return new Set(
		links.filter((link) => link.taskId === taskId || link.dependsOnTaskId === taskId).map((link) => link.id)
	);
}
