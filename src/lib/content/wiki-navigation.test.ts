import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask } from '$lib/stores/tasks';
import type { WikiClick } from '$lib/content/wiki-links';
import { planWikiClick, wikiEntityFor } from '$lib/content/wiki-navigation';

const source = createNote({ id: 'source', title: 'Source', folder: 'personal', workspaceId: 'one' });
const note = createNote({ id: 'note', title: 'Plan', workspaceId: 'one' });
const task = createTask({ id: 'task', title: 'Ship it', workspaceId: 'one' });

function textClick(target: string, heading: string | null = null): WikiClick {
	return { target: null, targetText: target, candidates: [], heading };
}

describe('wikiEntityFor', () => {
	it('looks the target up in the pool matching its kind', () => {
		expect(wikiEntityFor({ id: 'task', kind: 'task' }, [note], [task])).toMatchObject({
			id: 'task',
			kind: 'task',
		});
		expect(wikiEntityFor({ id: 'note', kind: 'note' }, [note], [task])).toMatchObject({
			id: 'note',
			kind: 'note',
		});
	});

	it('returns null when the target is gone', () => {
		expect(wikiEntityFor({ id: 'missing', kind: 'note' }, [note], [task])).toBeNull();
	});
});

describe('planWikiClick', () => {
	it('opens a resolved note and keeps the heading', () => {
		expect(planWikiClick(textClick('Plan#Intro', 'intro'), source, [note])).toEqual({
			status: 'open',
			entity: expect.objectContaining({ id: 'note', kind: 'note' }),
			heading: 'intro',
		});
	});

	it('opens tasks linked from a note', () => {
		expect(planWikiClick(textClick('Ship it'), source, [note], [], [task])).toMatchObject({
			status: 'open',
			entity: { id: 'task', kind: 'task' },
		});
	});

	it('asks the user when a title matches a note and a task', () => {
		const duplicate = createNote({ id: 'dup', title: 'Ship it', workspaceId: 'one' });
		expect(planWikiClick(textClick('Ship it'), source, [duplicate], [], [task])).toMatchObject({
			status: 'choose',
			entities: [
				{ id: 'dup', kind: 'note' },
				{ id: 'task', kind: 'task' },
			],
		});
	});

	it('plans note creation for unresolved links', () => {
		expect(planWikiClick(textClick('New note'), source, [note])).toEqual({
			status: 'create',
			title: 'New note',
			folder: 'personal',
			heading: null,
		});
	});

	it('uses the folder of an unresolved folder-qualified link', () => {
		expect(
			planWikiClick(textClick('Projects/New note'), source, [note], [
				{ id: 'projects', label: 'Projects' },
			]),
		).toMatchObject({ status: 'create', folder: 'projects' });
	});

	it('maps rendered candidate ids back to entities', () => {
		const click: WikiClick = {
			target: null,
			targetText: 'Plan',
			candidates: [
				{ id: 'note', kind: 'note' },
				{ id: 'missing', kind: 'task' },
			],
			heading: null,
		};
		expect(planWikiClick(click, source, [note], [], [task])).toMatchObject({
			status: 'choose',
			entities: [{ id: 'note', kind: 'note' }],
		});
	});

	it('ignores clicks that carry nothing actionable', () => {
		expect(planWikiClick(textClick(''), source, [note])).toBeNull();
		expect(
			planWikiClick(
				{ target: { id: 'missing', kind: 'note' }, targetText: null, candidates: [], heading: null },
				source,
				[note],
			),
		).toBeNull();
	});
});
