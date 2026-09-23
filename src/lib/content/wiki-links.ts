import MarkdownIt from 'markdown-it';
import type MarkdownItType = require('markdown-it');
import type { CustomFolder } from '$lib/stores/notes';

export type WikiEntityKind = 'note' | 'task';

/** Anything a wiki link can point at. Notes and tasks both carry these fields. */
export type WikiSource = {
	id: string;
	title: string;
	folder: string;
	workspaceId?: string;
	/** Notes carry a body; tasks do not. Used to expand `![[embeds]]`. */
	body?: string;
};

/** A resolved wiki target with its entity kind attached. */
export type WikiEntity = WikiSource & { kind: WikiEntityKind };

export type WikiReference = {
	target: string;
	path: string;
	heading: string | null;
	alias: string | null;
	embed: boolean;
};

export type WikiResolution =
	| { status: 'resolved'; entity: WikiEntity; heading: string | null }
	| { status: 'ambiguous'; entities: WikiEntity[]; heading: string | null }
	| { status: 'unresolved'; title: string; folder: string | null; heading: string | null };

export type WikiRenderContext = {
	source: WikiSource;
	notes: WikiSource[];
	tasks?: WikiSource[];
	folders?: CustomFolder[];
	stack?: string[];
};

export type WikiClickTarget = { id: string; kind: WikiEntityKind };

export type WikiClick = {
	target: WikiClickTarget | null;
	targetText: string | null;
	candidates: WikiClickTarget[];
	heading: string | null;
};

type WikiToken = MarkdownItType.Token & { meta?: { wikiReference?: WikiReference } };

export function parseWikiTarget(raw: string, embed = false): WikiReference | null {
	const [targetPart, aliasPart] = raw.split('|', 2);
	const target = targetPart.trim();
	const hash = target.indexOf('#');
	const path = (hash < 0 ? target : target.slice(0, hash)).trim();
	if (!path) return null;
	return {
		target: raw.trim(),
		path,
		heading: hash < 0 ? null : target.slice(hash + 1).trim() || null,
		alias: aliasPart?.trim() || null,
		embed,
	};
}

function wikiInlineRule(state: MarkdownItType.StateInline, silent: boolean): boolean {
	const start = state.pos;
	const embed = state.src.startsWith('![[', start);
	const open = embed ? start + 1 : start;
	if (!state.src.startsWith('[[', open)) return false;
	const close = state.src.indexOf(']]', open + 2);
	if (close < 0 || state.src.slice(open + 2, close).includes('[[')) return false;
	const reference = parseWikiTarget(state.src.slice(open + 2, close), embed);
	if (!reference) return false;
	if (!silent) {
		const token = state.push(embed ? 'wiki_embed' : 'wiki_link', embed ? 'span' : 'a', 0) as WikiToken;
		token.meta = { wikiReference: reference };
		token.content = reference.alias ?? reference.path;
		token.markup = embed ? '![[ ]]' : '[[ ]]';
	}
	state.pos = close + 2;
	return true;
}

export function installWikiLinkRule(parser: MarkdownItType.MarkdownIt): void {
	parser.inline.ruler.before('link', 'wiki_link', wikiInlineRule);
}

export function parseWikiReferences(body: string): WikiReference[] {
	const parser = new MarkdownIt({ html: false, linkify: false });
	installWikiLinkRule(parser);
	const tokens = parser.parse(body, {});
	const references: WikiReference[] = [];
	const visit = (items: MarkdownItType.Token[]) => {
		for (const token of items) {
			const reference = (token as WikiToken).meta?.wikiReference;
			if (reference) references.push(reference);
			if (token.children) visit(token.children);
		}
	};
	visit(tokens);
	return references;
}

function asEntity(source: WikiSource, kind: WikiEntityKind): WikiEntity {
	return { ...source, kind };
}

/**
 * Resolves a reference inside `source`'s workspace. Notes win ties only by
 * order: a title that matches a note and a task is reported as ambiguous.
 */
export function resolveWikiReference(
	reference: WikiReference,
	source: WikiSource,
	notes: WikiSource[],
	folders: CustomFolder[] = [],
	tasks: WikiSource[] = [],
): WikiResolution {
	const workspaceId = source.workspaceId ?? 'workspace-default';
	const slash = reference.path.lastIndexOf('/');
	const folderPath = slash < 0 ? null : normalize(reference.path.slice(0, slash));
	const title = slash < 0 ? reference.path : reference.path.slice(slash + 1);
	const folderIds = folderPath
		? new Set(
				folders
					.filter((folder) => normalize(folder.id) === folderPath || normalize(folder.label) === folderPath)
					.map((folder) => folder.id),
			)
		: null;
	const matches = (candidate: WikiSource) => {
		if ((candidate.workspaceId ?? 'workspace-default') !== workspaceId) return false;
		if (normalize(candidate.title) !== normalize(title)) return false;
		return !folderPath || Boolean(folderIds?.has(candidate.folder)) || normalize(candidate.folder) === folderPath;
	};
	const entities: WikiEntity[] = [
		...notes.filter(matches).map((note) => asEntity(note, 'note')),
		...tasks.filter(matches).map((task) => asEntity(task, 'task')),
	];
	if (entities.length === 1) return { status: 'resolved', entity: entities[0], heading: reference.heading };
	if (entities.length > 1) return { status: 'ambiguous', entities, heading: reference.heading };
	return {
		status: 'unresolved',
		title,
		folder: folderPath ? folders.find((folder) => folderIds?.has(folder.id))?.id ?? reference.path.slice(0, slash) : null,
		heading: reference.heading,
	};
}

export function slugifyHeading(value: string): string {
	return value
		.toLocaleLowerCase()
		.trim()
		.replace(/[`*_~]/g, '')
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

export function escapeWikiHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function wikiEntityLabel(entity: Pick<WikiEntity, 'kind'>): string {
	return entity.kind === 'task' ? 'Task' : 'Note';
}

export function renderWikiToken(
	parser: MarkdownItType.MarkdownIt,
	tokens: MarkdownItType.Token[],
	index: number,
	context?: WikiRenderContext,
): string {
	const token = tokens[index] as WikiToken;
	const reference = token.meta?.wikiReference;
	if (!reference) return '';
	const resolution = context
		? resolveWikiReference(reference, context.source, context.notes, context.folders, context.tasks)
		: null;
	const label = escapeWikiHtml(token.content);
	const heading = reference.heading
		? ` data-wiki-heading="${escapeWikiHtml(slugifyHeading(reference.heading))}"`
		: '';

	if (token.type === 'wiki_embed') {
		if (resolution?.status !== 'resolved' || resolution.entity.kind !== 'note') {
			return `<div class="wiki-embed-unresolved">${label}</div>`;
		}
		const stack = context?.stack ?? [context?.source.id ?? ''];
		if (stack.includes(resolution.entity.id) || stack.length >= 5) {
			return `<span class="wiki-embed-cycle">${escapeWikiHtml(resolution.entity.title)}</span>`;
		}
		const nestedContext: WikiRenderContext = {
			...context!,
			source: resolution.entity,
			stack: [...stack, resolution.entity.id],
		};
		const content = parser.render(resolution.entity.body ?? '', { wiki: nestedContext });
		return `<span class="wiki-embed" data-wiki-target="${escapeWikiHtml(resolution.entity.id)}" data-wiki-kind="note"${heading}>${content}</span>`;
	}

	if (!resolution || resolution.status === 'unresolved') {
		return `<a class="wiki-link wiki-link-unresolved" href="#" data-wiki-target-text="${escapeWikiHtml(reference.target)}"${heading}>${label}</a>`;
	}
	if (resolution.status === 'ambiguous') {
		const candidates = resolution.entities.map((entity) => `${entity.kind}:${entity.id}`).join(',');
		return `<a class="wiki-link wiki-link-ambiguous" href="#" data-wiki-candidates="${escapeWikiHtml(candidates)}" data-wiki-target-text="${escapeWikiHtml(reference.target)}"${heading}>${label}</a>`;
	}
	return `<a class="wiki-link" href="#${encodeURIComponent(resolution.entity.id)}" data-wiki-target="${escapeWikiHtml(resolution.entity.id)}" data-wiki-kind="${resolution.entity.kind}"${heading}>${label}</a>`;
}

function parseCandidate(value: string): WikiClickTarget | null {
	const [kind, id] = value.split(':', 2);
	if (!id) return null;
	return { id, kind: kind === 'task' ? 'task' : 'note' };
}

export function wikiClickFromTarget(target: EventTarget | null, root: HTMLElement): WikiClick | null {
	if (!(target instanceof Element)) return null;
	const anchor = target.closest<HTMLAnchorElement>('a[data-wiki-target], a[data-wiki-target-text], a[data-wiki-candidates]');
	if (!anchor || !root.contains(anchor)) return null;
	const id = anchor.dataset.wikiTarget ?? null;
	return {
		target: id ? { id, kind: anchor.dataset.wikiKind === 'task' ? 'task' : 'note' } : null,
		targetText: anchor.dataset.wikiTargetText ?? null,
		candidates: (anchor.dataset.wikiCandidates ?? '').split(',').filter(Boolean).flatMap((value) => {
			const candidate = parseCandidate(value);
			return candidate ? [candidate] : [];
		}),
		heading: anchor.dataset.wikiHeading ?? null,
	};
}

function normalize(value: string): string {
	return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
