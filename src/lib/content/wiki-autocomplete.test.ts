import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import {
	applyWikilink,
	moveSuggestion,
	splitWikiPath,
	wikiQueryAt,
	wikiSuggestionsFor,
	wikilinkText
} from '$lib/content/wiki-autocomplete';

const note = (id: string, title: string, over = {}) =>
	createNote({ id, title, workspaceId: 'one', ...over });
const task = (id: string, title: string, over = {}) =>
	createTask({ id, title, workspaceId: 'one', ...over });

const source = note('source', 'Source');
const plan = note('plan', 'Plan');
const player = note('player', 'Player notes');
const other = note('other', 'Plan', { workspaceId: 'two' });
const ship = task('ship', 'Ship it');

const context = {
	source,
	notes: [source, plan, player, other],
	tasks: [ship],
	folders: [{ id: 'projects', label: 'Projects' }]
};

describe('wikiQueryAt', () => {
	it('reads the target, heading, and alias after an opener', () => {
		const value = 'see [[Projects/Plan#Sprint 1|the plan';
		expect(wikiQueryAt(value, value.length)).toEqual({
			start: 4,
			end: value.length,
			text: 'Projects/Plan',
			heading: 'Sprint 1',
			alias: 'the plan'
		});
	});

	it('reads a bare opener with an empty query', () => {
		expect(wikiQueryAt('type [[', 7)).toMatchObject({ start: 5, text: '', heading: null, alias: null });
	});

	it('ignores a caret outside any opener', () => {
		expect(wikiQueryAt('plain text', 6)).toBeNull();
		expect(wikiQueryAt('single [ bracket', 8)).toBeNull();
	});

	it('cancels the query on a close, a newline, or a nested opener', () => {
		expect(wikiQueryAt('[[Plan]] more', 11)).toBeNull();
		expect(wikiQueryAt('[[Plan\nstill', 10)).toBeNull();
		expect(wikiQueryAt('[[[[Plan', 7)).toBeNull();
	});

	it('treats a triple bracket as its own opener', () => {
		const value = '[[[Plan';
		expect(wikiQueryAt(value, value.length)).toMatchObject({ start: 0, text: '[Plan' });
	});
});

describe('splitWikiPath', () => {
	it('splits a folder qualifier from the title', () => {
		expect(splitWikiPath('Projects/Plan')).toEqual({ folder: 'Projects', title: 'Plan' });
		expect(splitWikiPath('Plan')).toEqual({ folder: '', title: 'Plan' });
	});
});

describe('wikiSuggestionsFor', () => {
	it('lists notes and tasks for a bare opener', () => {
		const set = wikiSuggestionsFor('[[', 2, context);
		expect(set?.items.map((item) => item.entity.title)).toEqual(['Plan', 'Player notes', 'Ship it']);
		expect(set?.index).toBe(0);
	});

	it('never suggests the note being edited', () => {
		const set = wikiSuggestionsFor('[[', 2, context);
		expect(set?.items.some((item) => item.entity.id === 'source')).toBe(false);
	});

	it('stays inside the source workspace', () => {
		const bare = wikiSuggestionsFor('[[', 2, context);
		expect(bare?.items.every((item) => item.entity.workspaceId === 'one')).toBe(true);
		expect(bare?.items.some((item) => item.entity.id === 'other')).toBe(false);

		const typed = wikiSuggestionsFor('[[Plan', 6, context);
		expect(typed?.items.map((item) => item.entity.id)).toEqual(['plan']);
	});

	it('narrows the list once a title matches exactly', () => {
		// `[[Plan` already resolves, so it stops offering prefix candidates.
		expect(wikiSuggestionsFor('[[Plan', 6, context)?.items.map((item) => item.entity.title)).toEqual([
			'Plan'
		]);
		// A prefix that resolves to nothing keeps browsing the whole pool.
		expect(wikiSuggestionsFor('[[Pl', 4, context)?.items.map((item) => item.entity.title)).toEqual([
			'Plan',
			'Player notes'
		]);
	});

	it('ranks a title prefix above a substring match', () => {
		// Neither title resolves exactly, so the ranking (not the narrowing) decides.
		const alpha = note('a1', 'Alphaville notes');
		const beta = note('b1', 'Beta alpha');
		const set = wikiSuggestionsFor('[[Alpha', 7, { ...context, notes: [alpha, beta] });
		expect(set?.items.map((item) => item.entity.title)).toEqual(['Alphaville notes', 'Beta alpha']);
	});

	it('narrows to the entity the typed title resolves to', () => {
		const set = wikiSuggestionsFor('[[Ship it', 9, context);
		expect(set?.items.map((item) => item.entity.id)).toEqual(['ship']);
	});

	it('matches case-insensitively and highlights the matched run', () => {
		const set = wikiSuggestionsFor('[[play', 6, context);
		expect(set?.items[0]?.entity.title).toBe('Player notes');
		expect(set?.items[0]?.highlight).toEqual(['', 'Play', 'er notes']);
	});

	it('narrows by a folder qualifier', () => {
		const projects = note('p1', 'Alpha', { folder: 'projects' });
		const personal = note('p2', 'Alpha', { folder: 'personal' });
		const set = wikiSuggestionsFor('[[Projects/Al', 13, {
			...context,
			notes: [projects, personal]
		});
		expect(set?.items.map((item) => item.entity.id)).toEqual(['p1']);
	});

	it('returns nothing when no title matches', () => {
		expect(wikiSuggestionsFor('[[zzz', 5, context)?.items).toEqual([]);
		expect(wikiSuggestionsFor('no opener', 9, context)).toBeNull();
	});

	it('suggests the link a task target resolves to', () => {
		const set = wikiSuggestionsFor('[[Sh', 4, context);
		expect(set?.items.map((item) => item.entity.kind)).toEqual(['task']);
	});
});

describe('moveSuggestion', () => {
	it('wraps at both ends', () => {
		expect(moveSuggestion(0, 3, -1)).toBe(2);
		expect(moveSuggestion(2, 3, 1)).toBe(0);
		expect(moveSuggestion(1, 3, 1)).toBe(2);
	});

	it('reports no selection for an empty list', () => {
		expect(moveSuggestion(0, 0, 1)).toBe(-1);
	});
});

describe('applyWikilink', () => {
	const query = { start: 4, end: 8, heading: null, alias: null };

	it('replaces the typed query and reports the new caret', () => {
		const result = applyWikilink('see [[Pl', query, { title: 'Plan', kind: 'note' }, query);
		expect(result.value).toBe('see [[Plan]]');
		expect(result.caret).toBe('see [[Plan]]'.length);
	});

	it('keeps text that follows the caret', () => {
		const result = applyWikilink('see [[Pl and more', query, { title: 'Plan', kind: 'note' }, query);
		expect(result.value).toBe('see [[Plan]] and more');
	});

	it('carries the typed heading and alias into the link', () => {
		expect(wikilinkText({ title: 'Plan', kind: 'note' }, { heading: 'Sprint 1', alias: 'the plan' })).toBe(
			'[[Plan#Sprint 1|the plan]]'
		);
		expect(
			applyWikilink('[[Plan#Sp', { start: 0, end: 9 }, { title: 'Plan', kind: 'note' }, {
				heading: 'Sp',
				alias: null
			}).value
		).toBe('[[Plan#Sp]]');
	});

	it('drops a heading when the target is a task', () => {
		expect(wikilinkText({ title: 'Ship it', kind: 'task' }, { heading: 'Intro', alias: null })).toBe(
			'[[Ship it]]'
		);
		expect(
			wikilinkText({ title: 'Ship it', kind: 'task' }, { heading: null, alias: 'the work' })
		).toBe('[[Ship it|the work]]');
	});
});
