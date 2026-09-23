import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import { parseWikiReferences, resolveWikiReference, slugifyHeading } from '$lib/content/wiki-links';

const source = createNote({ id: 'source', title: 'Source', workspaceId: 'one' });
const target = createNote({ id: 'target', title: 'Plan', folder: 'projects', workspaceId: 'one' });
const task = createTask({ id: 'task-one', title: 'Ship it', workspaceId: 'one' });

describe('parseWikiReferences', () => {
	it('parses aliases, folder paths, headings, and embeds', () => {
		expect(parseWikiReferences('[[Plan|the plan]] [[Projects/Plan#Sprint 1]] ![[Plan]]')).toEqual([
			{ target: 'Plan|the plan', path: 'Plan', heading: null, alias: 'the plan', embed: false },
			{ target: 'Projects/Plan#Sprint 1', path: 'Projects/Plan', heading: 'Sprint 1', alias: null, embed: false },
			{ target: 'Plan', path: 'Plan', heading: null, alias: null, embed: true },
		]);
	});

	it('does not parse wiki syntax inside inline or fenced code', () => {
		const refs = parseWikiReferences('`[[inline]]`\n\n```md\n[[fenced]]\n```\n\n[[real]]');
		expect(refs.map((ref) => ref.path)).toEqual(['real']);
	});

	it('creates stable heading slugs', () => {
		expect(slugifyHeading('Sprint 1: Review & Plan')).toBe('sprint-1-review-plan');
	});
});

describe('resolveWikiReference', () => {
	it('resolves notes only within the source workspace', () => {
		const outside = createNote({ id: 'outside', title: 'Elsewhere', workspaceId: 'two' });
		const local = createNote({ id: 'local', title: 'Elsewhere', workspaceId: 'one' });
		const result = resolveWikiReference(parseWikiReferences('[[Elsewhere]]')[0], source, [outside, local]);
		expect(result).toMatchObject({ status: 'resolved', entity: { id: 'local', kind: 'note' } });
	});

	it('resolves tasks inside the same workspace', () => {
		const result = resolveWikiReference(parseWikiReferences('[[Ship it]]')[0], source, [target], [], [task]);
		expect(result).toMatchObject({ status: 'resolved', entity: { id: 'task-one', kind: 'task' } });
	});

	it('reports duplicate titles as ambiguous across notes and tasks', () => {
		const first = createNote({ id: 'first', title: 'Plan', workspaceId: 'one' });
		const second = createTask({ id: 'second', title: 'plan', workspaceId: 'one' });
		const result = resolveWikiReference(parseWikiReferences('[[Plan]]')[0], source, [first], [], [second]);
		expect(result).toMatchObject({
			status: 'ambiguous',
			entities: [
				{ id: 'first', kind: 'note' },
				{ id: 'second', kind: 'task' },
			],
		});
	});

	it('resolves folder-qualified targets by folder id or label', () => {
		const result = resolveWikiReference(
			parseWikiReferences('[[Projects/Plan]]')[0],
			source,
			[target],
			[{ id: 'projects', label: 'Projects' }],
		);
		expect(result).toMatchObject({ status: 'resolved', entity: { id: 'target', kind: 'note' } });
	});

	it('returns unresolved target details', () => {
		expect(resolveWikiReference(parseWikiReferences('[[New note#Intro]]')[0], source, [])).toEqual({
			status: 'unresolved',
			title: 'New note',
			folder: null,
			heading: 'Intro',
		});
	});
});
