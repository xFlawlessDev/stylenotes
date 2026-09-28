import {
	addDays,
	diffDays,
	formatTimelineMonth,
	startOfDay,
	taskBar,
	type Task,
	type TaskDependency,
	type TimelineRange
} from '$lib/stores/tasks';

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
 *
 * Kept as the day-scale entry point; other scales go through {@link ganttScaleDayWidth}.
 */
export function ganttDayWidth(available: number, days: number): number {
	if (!Number.isFinite(available) || days <= 0) return GANTT_DEFAULT_DAY_WIDTH;
	const fitted = (available - 2) / days;
	return Math.floor(Math.min(GANTT_MAX_DAY_WIDTH, Math.max(GANTT_MIN_DAY_WIDTH, fitted)));
}

/**
 * How the timeline buckets days into columns:
 * `date` is one column per day, `week` one per calendar week, `month` one per month.
 */
export type GanttTimelineScale = 'date' | 'week' | 'month';

/**
 * Per-day pixel width for each scale, in px. Bars are positioned by day offsets,
 * so the width-per-day must stay uniform across the timeline; the scale only
 * changes how far a day is compressed and how the header is bucketed.
 */
const GANTT_SCALE_DAY_WIDTH: Record<GanttTimelineScale, { min: number; max: number }> = {
	date: { min: GANTT_MIN_DAY_WIDTH, max: GANTT_MAX_DAY_WIDTH },
	week: { min: 4, max: 12 },
	month: { min: 2, max: 8 }
};

/**
 * Picks the pixel width of a single day for `scale` so the whole timeline fits
 * `available` px when it can, clamped to that scale's readable bounds; the panel
 * scrolls horizontally when the range still does not fit.
 */
export function ganttScaleDayWidth(
	scale: GanttTimelineScale,
	days: number,
	available: number
): number {
	if (!Number.isFinite(available) || days <= 0) return GANTT_DEFAULT_DAY_WIDTH;
	const { min, max } = GANTT_SCALE_DAY_WIDTH[scale];
	const fitted = (available - 2) / days;
	return Math.floor(Math.min(max, Math.max(min, fitted)));
}

/** A single column of the scaled timeline: a day, a week or a month. */
export type GanttTimelineColumn = {
	/** Stable key for keyed rendering, e.g. `2026-01-01`. */
	id: string;
	/** The first day the column covers. */
	start: Date;
	/** Days from `range.start` to the column's first day, for pixel placement. */
	offset: number;
	/** How many days the column covers (always 1 for the `date` scale). */
	span: number;
	/** Short label drawn inside the column: the day number, `W3` or `Jan`. */
	label: string;
	/** Longer label for the top strip, e.g. `Jan 5` or `January 2026`. */
	title: string;
	/** True when the column leads with a weekend/holiday band (Saturday). */
	weekendStart: boolean;
};

function isoWeek(date: Date): number {
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	// Thursday of the current week decides the ISO week-year and week number.
	const day = (target.getDay() + 6) % 7;
	target.setDate(target.getDate() - day + 3);
	const firstThursday = new Date(target.getFullYear(), 0, 4);
	const firstDay = (firstThursday.getDay() + 6) % 7;
	firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
	return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** The Monday that follows `date`; a Monday itself maps to the next one. */
function startOfNextWeek(date: Date): Date {
	const day = (date.getDay() + 6) % 7;
	return addDays(startOfDay(date), 7 - day);
}

/**
 * Buckets the range into timeline columns for the chosen scale. The first column
 * is widened backwards so it always starts at `range.start`; every later column
 * starts on the natural boundary (Monday, or the 1st of the month).
 */
export function ganttTimelineColumns(
	range: TimelineRange,
	scale: GanttTimelineScale
): GanttTimelineColumn[] {
	if (scale === 'date') {
		return Array.from({ length: range.days }, (_, index) => {
			const day = addDays(range.start, index);
			return {
				id: day.toISOString(),
				start: day,
				offset: index,
				span: 1,
				label: `${day.getDate()}`,
				title: day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
				weekendStart: day.getDay() === 6
			};
		});
	}

	const end = addDays(range.start, range.days - 1);
	const groups = ganttStripGroups(
		range,
		scale === 'week'
			? // The first column may start mid-week, so it runs up to the next Monday;
				// later columns advance a full week and therefore always start on Monday.
				(from) => startOfNextWeek(from)
			: (from) => new Date(from.getFullYear(), from.getMonth() + 1, 1),
		scale === 'week' ? (from) => `W${isoWeek(from)}` : (from) => formatTimelineMonth(from)
	);

	return groups.map((group) => {
		const start = addDays(range.start, group.offset);
		return {
			id: start.toISOString(),
			start,
			offset: group.offset,
			span: Math.min(group.span, diffDays(end, start) + 1),
			label: group.label,
			title:
				scale === 'week'
					? `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
					: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
			weekendStart: false
		};
	});
}

/** Top-strip label for the month/year a timeline column belongs to. */
export function ganttScaleContext(date: Date): string {
	return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** A labelled run of consecutive days in the header strip. */
export type GanttStripGroup = {
	/** Stable key for keyed rendering, e.g. `2026-0` or `2026`. */
	id: string;
	/** Label shown once for the whole run, e.g. `January 2026` or `2026`. */
	label: string;
	/** Days from `range.start` to the group's first day, for pixel placement. */
	offset: number;
	/** How many days the run covers within the range. */
	span: number;
};

/**
 * Splits the range into labelled runs using `next` to find each boundary and
 * `label` to name the run. The first run starts exactly at `range.start`.
 */
function ganttStripGroups(
	range: TimelineRange,
	next: (from: Date) => Date,
	label: (from: Date) => string
): GanttStripGroup[] {
	const groups: GanttStripGroup[] = [];
	const end = addDays(range.start, range.days - 1);
	let cursor = startOfDay(range.start);

	while (cursor <= end) {
		const boundary = next(cursor);
		const clampedEnd = boundary > addDays(end, 1) ? addDays(end, 1) : boundary;
		groups.push({
			id: `${cursor.getTime()}`,
			label: label(cursor),
			offset: diffDays(cursor, range.start),
			span: Math.max(1, diffDays(clampedEnd, cursor))
		});
		cursor = boundary;
	}
	return groups;
}

/**
 * Groups the range into calendar months so the header can label each month once.
 * Independent of the zoom scale: even in the `date` view a month heading spans
 * every day column it covers instead of repeating on each day.
 */
export function ganttMonthGroups(range: TimelineRange): GanttStripGroup[] {
	return ganttStripGroups(
		range,
		(from) => new Date(from.getFullYear(), from.getMonth() + 1, 1),
		(from) => ganttScaleContext(from)
	);
}

/**
 * Groups the range into calendar years. Used as the top strip on the `month`
 * scale, where the month cells below already carry the month name.
 */
export function ganttYearGroups(range: TimelineRange): GanttStripGroup[] {
	return ganttStripGroups(
		range,
		(from) => new Date(from.getFullYear() + 1, 0, 1),
		(from) => `${from.getFullYear()}`
	);
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
