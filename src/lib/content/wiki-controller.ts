import { emitTo } from '@tauri-apps/api/event';
import { createNote } from '$lib/content/content';
import { persistNote, type CustomFolder } from '$lib/stores/notes';
import type { Note } from '$lib/content/content';
import type { Task } from '$lib/stores/tasks';
import type { WikiClick, WikiEntity } from '$lib/content/wiki-links';
import { planWikiClick } from '$lib/content/wiki-navigation';
import {
	NOTE_HEADING_EVENT,
	NOTE_WINDOW_PREFIX,
	openNoteWindow,
	openTaskInWorkspace
} from '$lib/windows';

/** The navigation half of a wiki click, with the window's own queued save flushed first. */
export type WikiController = {
	/** Resolves a click; returns `choose` with the candidates for the caller to render. */
	resolve: (click: WikiClick) => { status: 'handled' } | { status: 'choose'; entities: WikiEntity[]; heading: string | null };
	/** Opens a chosen or resolved entity, persisting a newly created note. */
	open: (entity: WikiEntity, heading: string | null) => Promise<void>;
	/** Applies a `create` plan: persists the note and opens it. */
	create: (plan: Extract<ReturnType<typeof planWikiClick>, { status: 'create' }>) => Promise<void>;
};

/**
 * Builds the wiki-navigation controller a detail window shares between its
 * preview surface and its ambiguity dialog. `source`/`notes`/`tasks` are read
 * lazily so the controller always sees the window's latest state.
 */
export function createWikiController(options: {
	flush: () => Promise<void> | void;
	source: () => Note | Task | null;
	notes: () => Note[];
	tasks: () => Task[];
	folders: () => CustomFolder[];
	/** Lets the caller refresh its note list after a new note is created. */
	onnotes: (notes: Note[]) => void;
}): WikiController {
	async function open(entity: WikiEntity, heading: string | null) {
		await options.flush();
		if (entity.kind === 'task') {
			await openTaskInWorkspace(entity.id);
			return;
		}
		await openNoteWindow(entity.id);
		if (heading) await emitTo(`${NOTE_WINDOW_PREFIX}${entity.id}`, NOTE_HEADING_EVENT, { heading });
	}

	return {
		async create(plan) {
			const source = options.source();
			if (!source) return;
			await options.flush();
			const created = createNote({
				title: plan.title,
				folder: plan.folder,
				workspaceId: source.workspaceId
			});
			if (!(await persistNote(created))) return;
			options.onnotes([created, ...options.notes()]);
			await open({ ...created, kind: 'note' }, plan.heading);
		},
		resolve(click) {
			const source = options.source();
			if (!source) return { status: 'handled' };
			const plan = planWikiClick(click, source, options.notes(), options.folders(), options.tasks());
			if (!plan) return { status: 'handled' };
			if (plan.status === 'open') {
				void open(plan.entity, plan.heading);
				return { status: 'handled' };
			}
			if (plan.status === 'choose') {
				return { status: 'choose', entities: plan.entities, heading: plan.heading };
			}
			void this.create(plan);
			return { status: 'handled' };
		},
		open
	};
}
