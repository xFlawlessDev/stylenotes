import { tick } from 'svelte';
import { createNote as makeNote } from '$lib/content/content';
import type { Note } from '$lib/content/content';
import type { CustomFolder } from '$lib/stores/notes';
import type { Task } from '$lib/stores/tasks';
import type { WikiClick, WikiEntity, WikiSource } from '$lib/content/wiki-links';
import { planWikiClick, wikiEntityFor } from '$lib/content/wiki-navigation';
import type { GraphNode } from '$lib/content/workspace-graph';
import type { WorkspaceSection } from '$lib/windows';
import { persistNote } from '$lib/stores/notes';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import type { TaskView } from '$lib/components/tasks/TaskBoard.svelte';

/** Reactive slices plus navigation hooks the wiki flow reads and writes. */
export type WikiPort = {
	items: Note[];
	customFolders: CustomFolder[];
	tasks: Task[];
	selectedId: string;
	section: WorkspaceSection;
	taskView: TaskView;
	selectedTaskId: string;
	taskFocusToken: number;
	ambiguousEntities: WikiEntity[];
	ambiguousHeading: string | null;
	ambiguousOpen: boolean;
	activeFolder: string;
	activeTag: string | null;
	notify: (message: string) => void;
};

/**
 * `[[wiki link]]` handling for the workspace: resolve a click to open, choose
 * between matches, or create the missing note, plus graph-node navigation.
 */
export function createWikiFlow(port: WikiPort) {
	function showAmbiguous(entities: WikiEntity[], heading: string | null) {
		port.ambiguousEntities = entities;
		port.ambiguousHeading = heading;
		port.ambiguousOpen = entities.length > 0;
	}

	async function selectTarget(entity: WikiEntity, heading: string | null) {
		if (entity.kind === 'task') {
			port.section = 'tasks';
			port.taskView = 'list';
			port.selectedTaskId = entity.id;
			port.taskFocusToken += 1;
			return;
		}
		port.section = 'notes';
		port.activeFolder = 'all';
		port.activeTag = null;
		port.selectedId = entity.id;
		if (heading) {
			await tick();
			requestAnimationFrame(() => document.getElementById(heading)?.scrollIntoView());
		}
	}

	function sourceNote(): Note | undefined {
		return port.items.find((item) => item.id === port.selectedId);
	}

	async function handleClick(click: WikiClick) {
		const source = sourceNote();
		if (!source) return;
		await run(click, source);
	}

	/**
	 * Wiki click from the AI chat. The chat is global, so there is no open note
	 * to resolve against: a rendered `[[link]]` already carries its target, and
	 * an unresolved one creates the note in the active workspace.
	 */
	async function handleChatClick(click: WikiClick) {
		const fallback: WikiSource = {
			id: '',
			title: '',
			folder: 'personal',
			workspaceId: workspaceStore.activeId,
		};
		const source: WikiSource = sourceNote() ?? port.items[0] ?? fallback;
		await run(click, source);
	}

	/** Shared wiki-click outcome handling (open / choose / create). */
	async function run(click: WikiClick, source: WikiSource) {
		const plan = planWikiClick(click, source, port.items, port.customFolders, port.tasks);
		if (!plan) return;
		if (plan.status === 'open') {
			await selectTarget(plan.entity, plan.heading);
			return;
		}
		if (plan.status === 'choose') {
			showAmbiguous(plan.entities, plan.heading);
			return;
		}
		const created = makeNote({
			title: plan.title,
			folder: plan.folder,
			workspaceId: source.workspaceId ?? workspaceStore.activeId,
		});
		port.items = [created, ...port.items];
		const ok = await persistNote(created);
		if (!ok) {
			port.items = port.items.filter((item) => item.id !== created.id);
			port.notify('Could not create linked note');
			return;
		}
		await selectTarget({ ...created, kind: 'note' }, plan.heading);
	}

	function openGraphNode(node: GraphNode) {
		const entity = wikiEntityFor({ id: node.entityId, kind: node.kind }, port.items, port.tasks);
		if (entity) void selectTarget(entity, null);
	}

	return { showAmbiguous, selectTarget, handleClick, handleChatClick, openGraphNode };
}

export type WikiFlow = ReturnType<typeof createWikiFlow>;
