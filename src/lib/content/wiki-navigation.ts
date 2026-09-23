import type { CustomFolder } from '$lib/stores/notes';
import {
	parseWikiTarget,
	resolveWikiReference,
	type WikiClick,
	type WikiClickTarget,
	type WikiEntity,
	type WikiSource,
} from '$lib/content/wiki-links';

/** What a wiki click should do next, decided without touching the UI. */
export type WikiPlan =
	| { status: 'open'; entity: WikiEntity; heading: string | null }
	| { status: 'choose'; entities: WikiEntity[]; heading: string | null }
	| { status: 'create'; title: string; folder: string; heading: string | null };

/** Looks a rendered `data-wiki-target` up in the note and task pools. */
export function wikiEntityFor(
	target: WikiClickTarget,
	notes: WikiSource[],
	tasks: WikiSource[],
): WikiEntity | null {
	const pool = target.kind === 'task' ? tasks : notes;
	const found = pool.find((candidate) => candidate.id === target.id);
	return found ? { ...found, kind: target.kind } : null;
}

/**
 * Turns a rendered wiki click into one of three outcomes: open a resolved
 * target, ask the user which of several matches to open, or create the note an
 * unresolved link points at.
 */
export function planWikiClick(
	click: WikiClick,
	source: WikiSource,
	notes: WikiSource[],
	folders: CustomFolder[] = [],
	tasks: WikiSource[] = [],
): WikiPlan | null {
	if (click.target) {
		const entity = wikiEntityFor(click.target, notes, tasks);
		return entity ? { status: 'open', entity, heading: click.heading } : null;
	}
	if (click.candidates.length) {
		const entities = click.candidates
			.map((target) => wikiEntityFor(target, notes, tasks))
			.filter((entity): entity is WikiEntity => entity !== null);
		return entities.length ? { status: 'choose', entities, heading: click.heading } : null;
	}
	if (!click.targetText) return null;
	const reference = parseWikiTarget(click.targetText);
	if (!reference) return null;
	const resolution = resolveWikiReference(reference, source, notes, folders, tasks);
	if (resolution.status === 'resolved') {
		return { status: 'open', entity: resolution.entity, heading: click.heading };
	}
	if (resolution.status === 'ambiguous') {
		return { status: 'choose', entities: resolution.entities, heading: click.heading };
	}
	return {
		status: 'create',
		title: resolution.title,
		folder: resolution.folder ?? source.folder,
		heading: click.heading,
	};
}
