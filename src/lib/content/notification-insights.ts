/**
 * Live notification insights — the dynamic half of the notification panel.
 *
 * The panel's stored rows are *events*: the updater found a version, a semantic
 * tool failed for want of an embedder. Those are written once and read back.
 * The insights here are the opposite: computed from the app's live state on
 * every read, they appear while a condition holds and vanish when it clears.
 * Nothing is persisted, so a resolved condition can never leave a stale row.
 *
 * The aggregation is pure and framework-free so it is unit-testable; the panel
 * supplies the counts, the store wiring lives at the call site. Copy is a
 * catalog key plus params, never a baked string, so a language change
 * re-renders every row.
 */

import {
	isTaskBlocked,
	isTaskOverdue,
	taskStatus,
	type Task,
	type TaskDependency
} from '$lib/stores/tasks';
import { taskMatchesDate } from '$lib/stores/task-dashboard';
import type { SettingsSection } from '$lib/content/settings-sections';

export type InsightId =
	| 'tasks'
	| 'indexing'
	| 'vault'
	| 'suggestions'
	| 'attachments'
	| 'journal';

/** Tone tokens the panel understands for an insight row. */
export type NotificationInsightTone = 'primary' | 'secondary' | 'tertiary' | 'error';

/** Where a click on the row should land. Routed by the workspace shell. */
export type InsightTarget =
	| { kind: 'settings'; section: SettingsSection }
	| { kind: 'section'; section: 'notes' | 'tasks' | 'graph' }
	| { kind: 'journal' };

/** One computed row, ready to render through `t()`. */
export type NotificationInsight = {
	id: InsightId;
	/** i18n key for the title. */
	titleKey: string;
	titleParams?: Record<string, string | number>;
	/** i18n key for the body. */
	bodyKey: string;
	bodyParams?: Record<string, string | number>;
	tone: NotificationInsightTone;
	target: InsightTarget;
};

export type NotificationInsightInput = {
	indexing: {
		/** An embedder is selected and usable. */
		ready: boolean;
		/** A full build currently owns the writer. */
		active: boolean;
		indexed: number;
		pending: number;
	};
	tasks: { overdue: number; today: number; blocked: number };
	suggestions: number;
	vaultConflicts: number;
	orphanAttachments: number;
	journal: { enabled: boolean; written: boolean };
};

/**
 * The daily task summary: open work that is overdue, due today, or blocked by
 * an unfinished dependency. Completed tasks and `done` status are excluded
 * everywhere, matching the board's own notion of "open".
 */
export function taskInsightCounts(
	tasks: Task[],
	dependencies: TaskDependency[],
	now = new Date()
): { overdue: number; today: number; blocked: number } {
	const open = tasks.filter((task) => !task.completed && taskStatus(task) !== 'done');
	const overdue = open.filter((task) => isTaskOverdue(task, now)).length;
	const today = open.filter(
		(task) => !isTaskOverdue(task, now) && taskMatchesDate(task, now)
	).length;
	const blocked = open.filter((task) => isTaskBlocked(task, tasks, dependencies)).length;
	return { overdue, today, blocked };
}

/**
 * Builds the insight rows, in display order. A source with nothing to say
 * contributes no row, so an idle app shows a calm, empty panel rather than a
 * wall of zeroes.
 */
export function buildNotificationInsights(
	input: NotificationInsightInput
): NotificationInsight[] {
	const out: NotificationInsight[] = [];
	const { indexing, tasks, journal } = input;

	// A task that slipped is the most actionable thing on screen, so it leads.
	if (tasks.overdue > 0 || tasks.today > 0 || tasks.blocked > 0) {
		out.push({
			id: 'tasks',
			titleKey: 'shell.notification.insight.tasks.title',
			bodyKey: 'shell.notification.insight.tasks.body',
			bodyParams: { overdue: tasks.overdue, today: tasks.today, blocked: tasks.blocked },
			tone: tasks.overdue > 0 ? 'error' : 'primary',
			target: { kind: 'section', section: 'tasks' }
		});
	}

	if (indexing.ready && indexing.active) {
		const total = indexing.indexed + indexing.pending;
		out.push({
			id: 'indexing',
			titleKey: 'shell.notification.insight.indexing.title',
			bodyKey: total > 0
				? 'shell.notification.insight.indexing.progress'
				: 'shell.notification.insight.indexing.working',
			bodyParams: total > 0 ? { done: indexing.indexed, total } : undefined,
			tone: 'secondary',
			target: { kind: 'settings', section: 'memory' }
		});
	} else if (indexing.ready && indexing.pending > 0) {
		out.push({
			id: 'indexing',
			titleKey: 'shell.notification.insight.indexing.behindTitle',
			bodyKey: 'shell.notification.insight.indexing.behindBody',
			bodyParams: { count: indexing.pending },
			tone: 'secondary',
			target: { kind: 'settings', section: 'memory' }
		});
	}

	if (input.vaultConflicts > 0) {
		out.push({
			id: 'vault',
			titleKey: 'shell.notification.insight.vault.title',
			bodyKey: 'shell.notification.insight.vault.body',
			bodyParams: { count: input.vaultConflicts },
			tone: 'error',
			target: { kind: 'settings', section: 'vault' }
		});
	}

	if (input.suggestions > 0) {
		out.push({
			id: 'suggestions',
			titleKey: 'shell.notification.insight.suggestions.title',
			bodyKey: 'shell.notification.insight.suggestions.body',
			bodyParams: { count: input.suggestions },
			tone: 'tertiary',
			target: { kind: 'section', section: 'graph' }
		});
	}

	if (input.orphanAttachments > 0) {
		out.push({
			id: 'attachments',
			titleKey: 'shell.notification.insight.attachments.title',
			bodyKey: 'shell.notification.insight.attachments.body',
			bodyParams: { count: input.orphanAttachments },
			tone: 'primary',
			target: { kind: 'settings', section: 'attachments' }
		});
	}

	if (journal.enabled && !journal.written) {
		out.push({
			id: 'journal',
			titleKey: 'shell.notification.insight.journal.title',
			bodyKey: 'shell.notification.insight.journal.body',
			tone: 'tertiary',
			target: { kind: 'journal' }
		});
	}

	return out;
}
