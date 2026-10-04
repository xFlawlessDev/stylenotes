/**
 * Wires the live stores into the notification panel's insight rows.
 *
 * `content/notification-insights.ts` owns the decision of *what* to show and
 * the copy keys; this module only reads the current app state and hands it
 * over. A plain module (no runes of its own) so it stays a thin adapter; the
 * caller reads it in a template, where Svelte tracks each store access.
 */

import { memoryReady, memoryStore } from '$lib/stores/memory.svelte';
import { vaultStore } from '$lib/stores/vault.svelte';
import { attachmentStore } from '$lib/stores/attachments.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { todayEntry } from '$lib/stores/journal.svelte';
import {
	buildNotificationInsights,
	taskInsightCounts,
	type NotificationInsight
} from '$lib/content/notification-insights';
import type { Task, TaskDependency } from '$lib/stores/tasks';
import type { Note } from '$lib/content/content';

/**
 * The insight rows for the current workspace. `tasks`/`dependencies`/`notes`
 * are passed in because the workspace controller already owns the live lists;
 * everything else is read from the shared stores.
 */
export function workspaceInsights(
	tasks: Task[],
	dependencies: TaskDependency[],
	notes: Note[]
): NotificationInsight[] {
	return buildNotificationInsights({
		indexing: {
			ready: memoryReady(),
			active: memoryStore.indexing,
			indexed: memoryStore.indexed,
			pending: memoryStore.pending
		},
		tasks: taskInsightCounts(tasks, dependencies),
		suggestions: memoryStore.suggestions.length,
		vaultConflicts: vaultStore.conflicts.length,
		// Zero until the attachment manager has primed the catalog, so the row
		// never claims orphans it cannot actually see.
		orphanAttachments: attachmentStore.orphans.length,
		journal: {
			enabled: settings.journalEnabled === true,
			written: todayEntry(notes) !== null
		}
	});
}
