import type { Note } from '$lib/content/content';

export const TASK_STATUSES = ['todo', 'doing', 'review', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type Task = {
	id: string;
	workspaceId?: string;
	title: string;
	notes: string;
	status: TaskStatus;
	priority: TaskPriority;
	folder: string;
	/**
	 * Head of {@link Task.noteIds}, kept so task ↔ note links written by older
	 * builds (or by seed data) are still read and written back.
	 */
	noteId: string | null;
	noteIds: string[];
	startAt: string | null;
	dueAt: string | null;
	position: number;
	completed: boolean;
	overlay: boolean;
};

export type TaskDependency = {
	taskId: string;
	dependsOnTaskId: string;
	createdAt?: string;
};

export function canAddDependency(
	taskId: string,
	dependsOnTaskId: string,
	tasks: Task[],
	dependencies: TaskDependency[]
): boolean {
	if (taskId === dependsOnTaskId) return false;
	const task = tasks.find((item) => item.id === taskId);
	const dependency = tasks.find((item) => item.id === dependsOnTaskId);
	if (!task || !dependency || task.workspaceId !== dependency.workspaceId) return false;
	if (dependencies.some((item) => item.taskId === taskId && item.dependsOnTaskId === dependsOnTaskId)) return false;

	// Adding A -> B is invalid when B already reaches A.
	const visiting = new Set<string>();
	const reaches = (current: string): boolean => {
		if (current === taskId) return true;
		if (visiting.has(current)) return false;
		visiting.add(current);
		return dependencies
			.filter((item) => item.taskId === current)
			.some((item) => reaches(item.dependsOnTaskId));
	};
	return !reaches(dependsOnTaskId);
}

export function isTaskBlocked(task: Task, tasks: Task[], dependencies: TaskDependency[]): boolean {
	return dependencies
		.filter((item) => item.taskId === task.id)
		.some((item) => !tasks.find((candidate) => candidate.id === item.dependsOnTaskId)?.completed);
}

/** Tasks that `taskId` directly depends on, resolved from `tasks` (unknown ids are dropped). */
export function taskBlockers(taskId: string, tasks: Task[], dependencies: TaskDependency[]): Task[] {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	return dependencies
		.filter((item) => item.taskId === taskId)
		.map((item) => byId.get(item.dependsOnTaskId))
		.filter((task): task is Task => task !== undefined);
}

/** Tasks that directly depend on `taskId`, resolved from `tasks` (unknown ids are dropped). */
export function taskDependents(taskId: string, tasks: Task[], dependencies: TaskDependency[]): Task[] {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	return dependencies
		.filter((item) => item.dependsOnTaskId === taskId)
		.map((item) => byId.get(item.taskId))
		.filter((task): task is Task => task !== undefined);
}

export type TaskFormData = {
	title: string;
	notes: string;
	status: TaskStatus;
	priority: TaskPriority;
	folder: string;
	noteIds: string[];
	startAt: string | null;
	dueAt: string | null;
};

export const statusMeta: Record<TaskStatus, { label: string; tone: string; dot: string }> = {
	todo: { label: 'To do', tone: 'text-on-surface-variant', dot: 'bg-outline/70' },
	doing: { label: 'In progress', tone: 'text-secondary', dot: 'bg-secondary' },
	review: { label: 'In review', tone: 'text-tertiary', dot: 'bg-tertiary' },
	done: { label: 'Done', tone: 'text-primary', dot: 'bg-primary' },
};

export const priorityMeta: Record<
	TaskPriority,
	{ label: string; tone: string; dot: string; rank: number }
> = {
	low: { label: 'Low', tone: 'text-on-surface-variant', dot: 'bg-outline/60', rank: 0 },
	medium: { label: 'Medium', tone: 'text-secondary', dot: 'bg-secondary', rank: 1 },
	high: { label: 'High', tone: 'text-error', dot: 'bg-error', rank: 2 },
};

export function isTaskStatus(value: string): value is TaskStatus {
	return (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): value is TaskPriority {
	return (TASK_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Normalises a note list for persistence: trimmed, de-duplicated, and always
 * derived from `noteId` when the caller only supplied the legacy field.
 */
export function normalizeNoteIds(noteIds: string[] | null | undefined): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const id of noteIds ?? []) {
		const value = typeof id === 'string' ? id.trim() : '';
		if (!value || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

/** The notes a task links to, including the legacy {@link Task.noteId} field. */
export function taskNoteIds(task: Pick<Task, 'noteId'> & Partial<Pick<Task, 'noteIds'>>): string[] {
	return normalizeNoteIds([...(task.noteId ? [task.noteId] : []), ...(task.noteIds ?? [])]);
}

export function createTask(seed: Partial<Task> = {}): Task {
	const noteIds = normalizeNoteIds(
		seed.noteIds ?? (seed.noteId !== undefined && seed.noteId !== null ? [seed.noteId] : [])
	);
	return {
		id: seed.id ?? crypto.randomUUID(),
		workspaceId: seed.workspaceId ?? 'workspace-default',
		title: seed.title?.trim() || 'Untitled task',
		notes: seed.notes ?? '',
		status: seed.status && isTaskStatus(seed.status) ? seed.status : 'todo',
		priority: seed.priority && isTaskPriority(seed.priority) ? seed.priority : 'medium',
		folder: seed.folder ?? 'personal',
		noteId: noteIds[0] ?? null,
		noteIds,
		startAt: seed.startAt ?? null,
		dueAt: seed.dueAt ?? null,
		position: seed.position ?? 0,
		completed: seed.completed ?? seed.status === 'done',
		overlay: seed.overlay ?? false,
	};
}

export function taskStatus(task: Task): TaskStatus {
	return isTaskStatus(task.status) ? task.status : 'todo';
}

export function taskPriority(task: Task): TaskPriority {
	return isTaskPriority(task.priority) ? task.priority : 'medium';
}

export function tasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
	const groups: Record<TaskStatus, Task[]> = { todo: [], doing: [], review: [], done: [] };
	for (const task of tasks) {
		groups[taskStatus(task)].push(task);
	}
	for (const status of TASK_STATUSES) {
		groups[status].sort((a, b) => a.position - b.position);
	}
	return groups;
}

function comparePriority(a: Task, b: Task): number {
	return priorityMeta[taskPriority(b)].rank - priorityMeta[taskPriority(a)].rank;
}

function compareDue(a: Task, b: Task): number {
	const aDue = a.dueAt ?? '9999-12-31';
	const bDue = b.dueAt ?? '9999-12-31';
	if (aDue === bDue) return 0;
	return aDue < bDue ? -1 : 1;
}

function compareSmart(a: Task, b: Task): number {
	return comparePriority(a, b) || compareDue(a, b) || a.position - b.position;
}

export function sortTasks(tasks: Task[]): Task[] {
	return [...tasks].sort(compareSmart);
}

export const OVERLAY_SORTS = ['smart', 'due', 'priority', 'status', 'title'] as const;

export type OverlaySort = (typeof OVERLAY_SORTS)[number];

export const overlaySortLabels: Record<OverlaySort, string> = {
	smart: 'Smart (priority, due)',
	due: 'Due date',
	priority: 'Priority',
	status: 'Status',
	title: 'Title A–Z'
};

export function sortOverlayTasks(tasks: Task[], sort: OverlaySort = 'smart'): Task[] {
	const ordered = [...tasks];
	switch (sort) {
		case 'due':
			ordered.sort((a, b) => compareDue(a, b) || comparePriority(a, b) || a.position - b.position);
			break;
		case 'priority':
			ordered.sort((a, b) => comparePriority(a, b) || a.title.localeCompare(b.title));
			break;
		case 'status':
			ordered.sort(
				(a, b) =>
					TASK_STATUSES.indexOf(taskStatus(a)) - TASK_STATUSES.indexOf(taskStatus(b)) ||
					compareSmart(a, b)
			);
			break;
		case 'title':
			ordered.sort((a, b) => a.title.localeCompare(b.title));
			break;
		default:
			ordered.sort(compareSmart);
	}
	return ordered;
}

export type OverlayTaskFilter = {
	status?: TaskStatus | 'all';
	priority?: TaskPriorityFilter;
};

export function matchesOverlayFilter(task: Task, filter: OverlayTaskFilter = {}): boolean {
	const status = filter.status ?? 'all';
	const priority = filter.priority ?? 'all';
	if (status !== 'all' && taskStatus(task) !== status) return false;
	if (priority !== 'all' && taskPriority(task) !== priority) return false;
	return true;
}

export function overlayTasks(tasks: Task[], filter: OverlayTaskFilter = {}): Task[] {
	return sortTasks(tasks.filter((task) => task.overlay && matchesOverlayFilter(task, filter)));
}

export type TaskPatch = Partial<
	Pick<
		Task,
		| 'title'
		| 'notes'
		| 'status'
		| 'priority'
		| 'folder'
		| 'noteId'
		| 'noteIds'
		| 'startAt'
		| 'dueAt'
		| 'position'
		| 'completed'
		| 'overlay'
	>
>;

export function applyTaskPatch(task: Task, patch: TaskPatch): Task {
	const next: Task = { ...task, ...patch };
	if (patch.status !== undefined) {
		next.status = isTaskStatus(patch.status) ? patch.status : task.status;
		next.completed = next.status === 'done';
	}
	if (patch.priority !== undefined) {
		next.priority = isTaskPriority(patch.priority) ? patch.priority : task.priority;
	}
	if (patch.startAt !== undefined && patch.dueAt !== undefined) {
		if (patch.startAt && patch.dueAt && patch.dueAt < patch.startAt) {
			next.dueAt = patch.startAt;
		}
	}
	if (patch.noteIds !== undefined) {
		// `noteIds` is the whole list, so supplying it replaces the links.
		next.noteIds = normalizeNoteIds(patch.noteIds);
		next.noteId = next.noteIds[0] ?? null;
	} else if (patch.noteId !== undefined) {
		// Legacy callers move the head only, keeping the existing list behind it.
		next.noteIds = normalizeNoteIds([
			...(patch.noteId ? [patch.noteId] : []),
			...taskNoteIds(task)
		]);
		next.noteId = next.noteIds[0] ?? null;
	}
	return next;
}

export const TASK_DUE_FILTERS = ['any', 'overdue', 'today', 'week'] as const;

export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];

export type TaskPriorityFilter = TaskPriority | 'all';

export const dueFilterLabels: Record<TaskDueFilter, string> = {
	any: 'Any date',
	overdue: 'Overdue',
	today: 'Due today',
	week: 'Next 7 days',
};

export function matchesDueFilter(task: Task, filter: TaskDueFilter, now = new Date()): boolean {
	if (filter === 'any') return true;
	const due = parseTaskDate(task.dueAt);
	if (!due) return false;
	const day = startOfDay(now);
	const dueDay = startOfDay(due);
	if (filter === 'overdue') return taskStatus(task) !== 'done' && dueDay.getTime() < day.getTime();
	if (filter === 'today') return dueDay.getTime() === day.getTime();
	return dueDay.getTime() >= day.getTime() && diffDays(dueDay, day) <= 6;
}

export function matchesTaskQuery(task: Task, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const status = statusMeta[taskStatus(task)].label;
	const priority = priorityMeta[taskPriority(task)].label;
	return `${task.title} ${task.notes} ${task.folder} ${status} ${priority}`
		.toLowerCase()
		.includes(q);
}

export function filterTasks(
	tasks: Task[],
	opts: {
		folder?: string | null;
		query?: string;
		noteId?: string | null;
		priority?: TaskPriorityFilter;
		due?: TaskDueFilter;
		now?: Date;
	} = {}
): Task[] {
	const query = opts.query?.trim().toLowerCase() ?? '';
	const priority = opts.priority ?? 'all';
	const due = opts.due ?? 'any';
	return tasks.filter((task) => {
		if (opts.folder && opts.folder !== 'all' && task.folder !== opts.folder) return false;
		if (opts.noteId && !taskNoteIds(task).includes(opts.noteId)) return false;
		if (priority !== 'all' && taskPriority(task) !== priority) return false;
		if (!matchesDueFilter(task, due, opts.now)) return false;
		if (!query) return true;
		return `${task.title} ${task.notes}`.toLowerCase().includes(query);
	});
}

export type TimelineRange = { start: Date; days: number };

export function startOfDay(value: Date): Date {
	return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function parseTaskDate(value: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInput(value: string | null): string {
	const date = parseTaskDate(value);
	if (!date) return '';
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDateInput(value: string, time = 9): string | null {
	if (!value) return null;
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return null;
	date.setHours(time, 0, 0, 0);
	return date.toISOString();
}

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLong = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

export function formatTaskDate(value: string | null): string {
	const date = parseTaskDate(value);
	if (!date) return 'No date';
	return `${monthShort[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatTimelineDay(date: Date): string {
	return `${date.getDate()}`;
}

export function formatTimelineMonth(date: Date): string {
	return monthShort[date.getMonth()];
}

/**
 * Long month + year, locale-independent so the label does not change with the
 * test runner or OS locale. Exported for reuse by the Gantt header strips.
 */
export function formatTimelineMonthYear(date: Date): string {
	return `${monthLong[date.getMonth()]} ${date.getFullYear()}`;
}

export function addDays(value: Date, days: number): Date {
	return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

export function diffDays(a: Date, b: Date): number {
	const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
	return Math.round(ms / 86_400_000);
}

export function timelineRange(
	tasks: Task[],
	opts: { padding?: number; minDays?: number; anchor?: Date } = {}
): TimelineRange {
	const padding = opts.padding ?? 2;
	const minDays = opts.minDays ?? 14;
	const anchor = opts.anchor ?? new Date();
	let min: Date | null = null;
	let max: Date | null = null;

	for (const task of tasks) {
		const start = parseTaskDate(task.startAt) ?? parseTaskDate(task.dueAt);
		const end = parseTaskDate(task.dueAt) ?? parseTaskDate(task.startAt);
		if (!start || !end) continue;
		const startDay = startOfDay(start);
		const endDay = startOfDay(end);
		if (!min || startDay < min) min = startDay;
		if (!max || endDay > max) max = endDay;
	}

	if (!min || !max) {
		min = startOfDay(anchor);
		max = addDays(min, minDays - 1);
	} else {
		const span = diffDays(max, min) + 1;
		if (span < minDays) max = addDays(min, minDays - 1);
	}

	const start = addDays(min, -padding);
	const end = addDays(max, padding);
	return { start, days: Math.max(minDays, diffDays(end, start) + 1) };
}

export function taskBar(task: Task, range: TimelineRange): { offset: number; span: number } | null {
	const due = parseTaskDate(task.dueAt);
	const start = parseTaskDate(task.startAt) ?? due;
	const end = due ?? start;
	if (!start || !end) return null;
	const first = diffDays(start, range.start);
	const last = diffDays(end, range.start);
	const offset = Math.max(0, first);
	const clampedEnd = Math.min(range.days - 1, last);
	return { offset, span: Math.max(1, clampedEnd - offset + 1) };
}

export function isTaskOverdue(task: Task, now = new Date()): boolean {
	if (taskStatus(task) === 'done') return false;
	const due = parseTaskDate(task.dueAt);
	return due !== null && due < startOfDay(now);
}

/** First linked note title for a card chip, or null when nothing is linked. */
export function firstNoteTitle(
	task: Pick<Task, 'noteId'> & Partial<Pick<Task, 'noteIds'>>,
	noteTitles: Record<string, string>
): string | null {
	const id = taskNoteIds(task)[0];
	return id ? (noteTitles[id] ?? null) : null;
}

/** Titles for every note a task links to, in link order (unknown notes dropped). */
export function resolveNoteTitles(noteIds: string[] | null | undefined, notes: Note[]): string[] {
	const byId = new Map(notes.map((note) => [note.id, note.title]));
	return normalizeNoteIds(noteIds)
		.map((id) => byId.get(id))
		.filter((title): title is string => !!title);
}

/**
 * First linked note title, or null. Callers that render one chip (kanban cards)
 * use this; callers that list links use {@link resolveNoteTitles}.
 */
export function resolveNoteTitle(noteId: string | null, notes: Note[]): string | null {
	if (!noteId) return null;
	const note = notes.find((item) => item.id === noteId);
	return note?.title ?? null;
}

export function nextPosition(tasks: Task[], status: TaskStatus, workspaceId?: string): number {
	const column = tasks.filter(
		(task) =>
			taskStatus(task) === status &&
			(workspaceId === undefined || (task.workspaceId ?? 'workspace-default') === workspaceId)
	);
	return column.reduce((max, task) => Math.max(max, task.position), -1) + 1;
}

/**
 * Moves a task into `status`, right before `beforeId` (or at the end of the
 * column), renumbering the target column so positions stay dense.
 *
 * A window may hold tasks from every workspace, so the column is scoped to
 * `workspaceId` when the caller supplies it: positions must not be shared with
 * another workspace that happens to sit in the same list.
 */
export function moveTaskInList(
	tasks: Task[],
	id: string,
	status: TaskStatus,
	beforeId: string | null,
	workspaceId?: string
): Task[] {
	const task = tasks.find((item) => item.id === id);
	if (!task) return tasks;
	const scoped = workspaceId ?? task.workspaceId ?? 'workspace-default';
	const column = tasks
		.filter(
			(item) =>
				taskStatus(item) === status &&
				item.id !== id &&
				(item.workspaceId ?? 'workspace-default') === scoped
		)
		.sort((a, b) => a.position - b.position);
	const index = beforeId ? column.findIndex((item) => item.id === beforeId) : -1;
	const target = index >= 0 ? index : column.length;
	const ordered = [...column.slice(0, target), { ...task, status }, ...column.slice(target)];
	const positions = new Map(ordered.map((item, order) => [item.id, order]));
	return tasks.map((item) =>
		item.id === id
			? { ...applyTaskPatch(item, { status }), position: positions.get(id) ?? 0 }
			: positions.has(item.id)
				? { ...item, position: positions.get(item.id)! }
				: item
	);
}

export function reorderWithinColumn(
	tasks: Task[],
	status: TaskStatus,
	fromId: string,
	toId: string
): Task[] {
	const column = tasks.filter((task) => taskStatus(task) === status).sort((a, b) => a.position - b.position);
	const from = column.findIndex((task) => task.id === fromId);
	const to = column.findIndex((task) => task.id === toId);
	if (from < 0 || to < 0 || from === to) return tasks;
	const [moved] = column.splice(from, 1);
	column.splice(to, 0, moved);
	const positions = new Map(column.map((task, index) => [task.id, index]));
	return tasks.map((task) => (positions.has(task.id) ? { ...task, position: positions.get(task.id)! } : task));
}
