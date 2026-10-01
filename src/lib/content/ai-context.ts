/**
 * Builds the tool context for the AI chat.
 *
 * The chat is global, so this loads every record across workspaces — exactly
 * what the MCP host does before serving a tool call — and assembles the same
 * snapshot the shim reads. Independent of whether the MCP server is switched
 * on: the AI grant is separate.
 */
import { buildMcpSnapshot } from '$lib/content/mcp-snapshot';
import type { McpSnapshot } from '$lib/content/mcp-types';
import type { MemoryHooks, ToolContext } from '$lib/content/ai-tools';
import type { WriteContext } from '$lib/content/mcp-write-actions';
import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { loadWebHooks } from '$lib/stores/ai-web.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { localToday } from '$lib/stores/settings.svelte';
import { contradictionsFor, memoryReady, relatedNotes, semanticSearch, themesFor } from '$lib/stores/memory.svelte';
import { dependenciesRepo } from '$lib/db';

/** Loads notes, tasks, dependencies and workspaces into a tool context. */
export async function loadToolContext(): Promise<ToolContext> {
	const [notes, tasks, web] = await Promise.all([
		listAllNotes(),
		listAllTasks(),
		loadWebHooks().catch(() => undefined)
	]);
	const dependencies = workspaceStore.items.length
		? (
				await Promise.all(
					workspaceStore.items.map((workspace) =>
						dependenciesRepo.list(workspace.id).catch(() => [])
					)
				)
			).flat()
		: [];
	const write: WriteContext = {
		notes,
		tasks,
		dependencies,
		workspaceIds: new Set(workspaceStore.items.map((workspace) => workspace.id)),
		workspaces: workspaceStore.items.map((workspace) => ({ ...workspace }))
	};
	const snapshot = buildMcpSnapshot({
		notes,
		tasks,
		dependencies,
		folders: [],
		workspaces: workspaceStore.items,
		revision: Date.now(),
		appRunning: true,
		generatedAt: new Date().toISOString(),
		today: localToday()
	});
	return { snapshot, write, web, memory: loadMemoryHooks() };
}

/**
 * Semantic recall hooks for the chat, bound to the memory store.
 *
 * `ready` lets the executor report "not ready" instead of returning an empty
 * list, so the model falls back to `search_notes` rather than assuming there
 * are no matches (#D17).
 */
function loadMemoryHooks(): MemoryHooks {
	return {
		ready: () => memoryReady(),
		search: (query, limit) => semanticSearch(query, { limit }),
		related: (kind, id, limit) => relatedNotes(kind, id, limit),
		themes: (limit) => themesFor(limit),
		contradictions: (limit) => contradictionsFor(limit)
	};
}

/**
 * The system block that tells the model the snapshot is incomplete.
 *
 * Without it the failure is invisible: a body withheld by the budget looks
 * exactly like a note the user never wrote, and the model answers "this note
 * is empty" with full confidence. Returns null when nothing was left out, so
 * an ordinary chat pays nothing for the guarantee.
 *
 * Protocol copy addressed to the model — English, never translated (the i18n
 * rule covers text the user reads; this is text the model reads).
 */
export function snapshotNotice(snapshot: McpSnapshot): string | null {
	if (!snapshot.truncated) return null;
	const reason = snapshot.truncatedReason ?? 'unknown';

	if (snapshot.indexOnly) {
		return `Context limit (${reason}): this workspace snapshot carries no note bodies at all — titles, excerpts, tags and links only. Bodies were withheld to fit the size budget, so a note that appears to have no text is not empty. Work from excerpts and search, and say plainly when you are answering without the full text.`;
	}
	if (reason === 'note_count' || reason === 'task_count') {
		return `Context limit (${reason}): only part of this workspace is in the snapshot, so a note or task may be missing entirely rather than nonexistent. Do not conclude that something was deleted; say what you could not see.`;
	}
	return `Context limit (${reason}): part of this snapshot was trimmed. A note flagged \`truncated: true\` had its text cut short, and \`get_note\` failing because a body was withheld means there is more text than was loaded — in both cases the note is not empty. Work from excerpts and search, and say when you are missing the full text.`;
}