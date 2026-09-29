/**
 * Builds the tool context for the AI chat.
 *
 * The chat is global, so this loads every record across workspaces — exactly
 * what the MCP host does before serving a tool call — and assembles the same
 * snapshot the shim reads. Independent of whether the MCP server is switched
 * on: the AI grant is separate.
 */

import { buildMcpSnapshot } from '$lib/content/mcp-snapshot';
import type { ToolContext } from '$lib/content/ai-tools';
import type { WriteContext } from '$lib/content/mcp-write-actions';
import { listAllNotes } from '$lib/stores/notes';
import { listAllTasks } from '$lib/stores/tasks.svelte';
import { loadWebHooks } from '$lib/stores/ai-web.svelte';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
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
		generatedAt: new Date().toISOString()
	});

	return { snapshot, write, web };
}
