import { describe, expect, it } from 'vitest';
import {
	applyMention,
	mentionPool,
	mentionQueryAt,
	mentionSuggestionsFor,
	mentionText,
	mentionedIds,
	rankMentions
} from '$lib/content/ai-mentions';
import type { WikiEntity } from '$lib/content/wiki-links';

function entity(id: string, title: string, kind: 'note' | 'task' = 'note', workspaceId = 'w1'): WikiEntity {
	return { id, title, folder: 'personal', kind, workspaceId } as WikiEntity;
}

describe('mentionQueryAt', () => {
	it('reads a mention at the caret', () => {
		expect(mentionQueryAt('summarize @week', 14)).toEqual({ start: 10, end: 14, text: 'wee' });
	});

	it('accepts an empty query right after the marker', () => {
		expect(mentionQueryAt('@', 1)).toEqual({ start: 0, end: 1, text: '' });
	});

	it('ignores an email-style @ inside a word', () => {
		expect(mentionQueryAt('mail me at foo@bar', 17)).toBeNull();
	});

	it('stops once a space is typed', () => {
		expect(mentionQueryAt('@weekly review', 14)).toBeNull();
	});

	it('cancels across a newline', () => {
		expect(mentionQueryAt('@weekly\nreview', 14)).toBeNull();
	});

	it('returns null without an @', () => {
		expect(mentionQueryAt('just text', 9)).toBeNull();
	});
});

describe('mentionPool', () => {
	const context = {
		notes: [entity('n1', 'Alpha', 'note', 'w1'), entity('n2', 'Beta', 'note', 'w2')],
		tasks: [entity('t1', 'Ship it', 'task', 'w1')]
	};

	it('lists notes before tasks', () => {
		const pool = mentionPool(context, 'w1');
		expect(pool.map((item) => `${item.kind}:${item.id}`)).toEqual(['note:n1', 'task:t1']);
	});

	it('scopes to a workspace when given', () => {
		expect(mentionPool(context, 'w2').map((item) => item.id)).toEqual(['n2']);
	});

	it('keeps every entity when no workspace is given', () => {
		expect(mentionPool(context).length).toBe(3);
	});
});

describe('rankMentions', () => {
	const pool = [
		entity('n1', 'Weekly review'),
		entity('n2', 'Meeting notes'),
		entity('n3', 'Weekly plan')
	];

	it('matches case-insensitively and highlights the run', () => {
		const ranked = rankMentions(pool, { start: 0, end: 7, text: 'weekly' });
		expect(ranked.map((item) => item.entity.id)).toEqual(['n3', 'n1']);
		expect(ranked[0].highlight[1]).toBe('Weekly');
	});

	it('lists the pool on an empty query', () => {
		expect(rankMentions(pool, { start: 0, end: 1, text: '' })).toHaveLength(3);
	});

	it('drops non-matches', () => {
		expect(rankMentions(pool, { start: 0, end: 4, text: 'zzz' })).toEqual([]);
	});
});

describe('mentionSuggestionsFor', () => {
	it('wires the query to the ranked pool', () => {
		const result = mentionSuggestionsFor('see @week', 9, {
			notes: [entity('n1', 'Weekly review')]
		});
		expect(result?.items.map((item) => item.entity.id)).toEqual(['n1']);
	});

	it('returns null outside a mention', () => {
		expect(mentionSuggestionsFor('see weekly', 10, { notes: [] })).toBeNull();
	});
});

describe('applyMention', () => {
	it('replaces the query with the token and moves the caret', () => {
		const result = applyMention('see @week', { start: 4, end: 9 }, { title: 'Weekly review' });
		expect(result.value).toBe('see @Weekly review');
		expect(result.caret).toBe('see @Weekly review'.length);
	});

	it('keeps trailing text', () => {
		const result = applyMention('@we please', { start: 0, end: 3 }, { title: 'Weekly' });
		expect(result.value).toBe('@Weekly please');
	});
});

describe('mentionedIds', () => {
	const pool = [
		entity('n1', 'Weekly review'),
		entity('n2', 'Weekly'),
		entity('t1', 'Ship it', 'task')
	];

	it('finds both notes and tasks', () => {
		const ids = mentionedIds('summarize @Weekly review and @Ship it', pool);
		expect(ids).toContain('note:n1');
		expect(ids).toContain('task:t1');
	});

	it('prefers the longest matching title', () => {
		const ids = mentionedIds('@Weekly review', pool);
		expect(ids).toContain('note:n1');
		// `@Weekly` must not also match inside `@Weekly review`.
		expect(ids).not.toContain('note:n2');
	});

	it('matches before punctuation', () => {
		expect(mentionedIds('use @Ship it.', pool)).toContain('task:t1');
	});

	it('returns nothing when no mention resolves', () => {
		expect(mentionedIds('hello world', pool)).toEqual([]);
	});

	it('deduplicates repeated mentions', () => {
		expect(mentionedIds('@Ship it and @Ship it', pool)).toEqual(['task:t1']);
	});
});

describe('mentionText', () => {
	it('prefixes the title with @', () => {
		expect(mentionText({ title: 'Roadmap' })).toBe('@Roadmap');
	});
});
