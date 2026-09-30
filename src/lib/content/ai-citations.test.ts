import { describe, expect, it } from 'vitest';
import type { AiToolCall } from '$lib/content/ai-types';
import type { ToolResult } from '$lib/content/ai-tools';
import type { ToolTraceEntry } from '$lib/content/ai-trace';
import {
	citationAt,
	citationPreview,
	collectCitations,
	hostOf,
	linkCiteMarkers
} from '$lib/content/ai-citations';

const call = (id: string, name: string): AiToolCall => ({ id, name, arguments: '{}' });

const entry = (id: string, name: string, result: ToolResult): ToolTraceEntry => ({
	call: call(id, name),
	result
});

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
	ref: `w1/${id}`,
	id,
	title,
	...extra
});

describe('collectCitations', () => {
	it('numbers note results in first-seen order', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', {
				ok: true,
				data: { notes: [note('n1', 'Roadmap'), note('n2', 'Coffee')] }
			})
		]);
		expect(sources.map((source) => source.index)).toEqual([1, 2]);
		expect(sources[0]).toMatchObject({ kind: 'note', id: 'n1', title: 'Roadmap', ref: 'w1/n1' });
	});

	it('cites semantic and related hits the same way', () => {
		const sources = collectCitations([
			entry('c1', 'semantic_search', {
				ok: true,
				data: { results: [note('n1', 'Roadmap', { score: 0.9 })] }
			}),
			entry('c2', 'related_notes', {
				ok: true,
				data: { results: [note('n2', 'Coffee')] }
			})
		]);
		expect(sources.map((source) => source.title)).toEqual(['Roadmap', 'Coffee']);
	});

	it('marks task results as tasks', () => {
		const sources = collectCitations([
			entry('c1', 'list_tasks', { ok: true, data: { tasks: [{ ref: 'w1/t1', id: 't1', title: 'Ship it' }] } })
		]);
		expect(sources[0].kind).toBe('note');
	});

	it('reads the kind field when a summary carries one', () => {
		const sources = collectCitations([
			entry('c1', 'semantic_search', {
				ok: true,
				data: { results: [{ ref: 'w1/t1', id: 't1', title: 'Ship it', kind: 'task' }] }
			})
		]);
		expect(sources[0].kind).toBe('task');
	});

	it('cites web hits by url', () => {
		const sources = collectCitations([
			entry('c1', 'web_search', {
				ok: true,
				data: { results: [{ title: 'Docs', url: 'https://example.com/a', snippet: 'hi' }] }
			})
		]);
		expect(sources[0]).toMatchObject({ kind: 'web', ref: 'https://example.com/a', title: 'Docs' });
	});

	it('cites a single fetched page', () => {
		const sources = collectCitations([
			entry('c1', 'web_fetch', {
				ok: true,
				data: { url: 'https://example.com/a', text: 'body', chars: 4 }
			})
		]);
		// A fetched page has no title, so it is described by its url.
		expect(sources).toHaveLength(1);
		expect(sources[0].title).toBe('https://example.com/a');
	});

	it('deduplicates an entity found by several tools', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', { ok: true, data: { notes: [note('n1', 'Roadmap')] } }),
			entry('c2', 'get_note', { ok: true, data: note('n1', 'Roadmap', { body: 'x' }) })
		]);
		expect(sources).toHaveLength(1);
		expect(sources[0].index).toBe(1);
	});

	it('ignores failed results and write tools', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', { ok: false, error: 'nope' }),
			entry('c2', 'create_note', { ok: true, data: note('n9', 'Made') })
		]);
		expect(sources).toHaveLength(0);
	});

	it('ignores a call with no result yet', () => {
		const sources = collectCitations([{ call: call('c1', 'search_notes') }]);
		expect(sources).toHaveLength(0);
	});

	it('flattens theme members so they are citable', () => {
		const sources = collectCitations([
			entry('c1', 'list_themes', {
				ok: true,
				data: { themes: [{ label: 'Work', members: [note('n1', 'Roadmap')] }] }
			})
		]);
		expect(sources.map((source) => source.title)).toContain('Roadmap');
	});
});

describe('linkCiteMarkers', () => {
	const sources = collectCitations([
		entry('c1', 'search_notes', {
			ok: true,
			data: { notes: [note('n1', 'Roadmap'), note('n2', 'Coffee')] }
		})
	]);

	it('rewrites a known marker as a data-cite anchor', () => {
		expect(linkCiteMarkers('See [1] for more.', sources)).toContain('data-cite="1"');
	});

	it('rewrites a compound marker into one anchor per source', () => {
		const html = linkCiteMarkers('Both [1,2] apply.', sources);
		expect(html.match(/data-cite=/g)).toHaveLength(2);
	});

	it('leaves an unknown number exactly as written', () => {
		expect(linkCiteMarkers('See [9].', sources)).toBe('See [9].');
	});

	it('drops only the unknown numbers from a compound marker', () => {
		expect(linkCiteMarkers('See [1,9].', sources)).toContain('data-cite="1"');
		expect(linkCiteMarkers('See [1,9].', sources)).not.toContain('data-cite="9"');
	});

	it('never touches a Markdown link', () => {
		expect(linkCiteMarkers('[label](https://example.com)', sources)).toBe(
			'[label](https://example.com)'
		);
	});

	it('returns the text untouched when there are no sources', () => {
		expect(linkCiteMarkers('See [1].', [])).toBe('See [1].');
	});
});

describe('citationAt', () => {
	it('finds a source by its number', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', { ok: true, data: { notes: [note('n1', 'Roadmap')] } })
		]);
		expect(citationAt(sources, 1)?.title).toBe('Roadmap');
		expect(citationAt(sources, 5)).toBeNull();
	});
});

describe('collectCitations content capture', () => {
	it('captures a note body from get_note', () => {
		const sources = collectCitations([
			entry('c1', 'get_note', { ok: true, data: note('n1', 'Roadmap', { body: 'Full body' }) })
		]);
		expect(sources[0].content).toBe('Full body');
	});

	it('captures fetched page text', () => {
		const sources = collectCitations([
			entry('c1', 'web_fetch', {
				ok: true,
				data: { url: 'https://example.com/a', text: 'Readable page text' }
			})
		]);
		expect(sources[0].content).toBe('Readable page text');
	});

	it('leaves content undefined for a search hit with only a snippet', () => {
		const sources = collectCitations([
			entry('c1', 'web_search', {
				ok: true,
				data: { results: [{ title: 'Docs', url: 'https://example.com/a', snippet: 'hi' }] }
			})
		]);
		expect(sources[0].content).toBeUndefined();
	});
});

describe('citationPreview', () => {
	it('prefers the live record body over the captured content', () => {
		const sources = collectCitations([
			entry('c1', 'get_note', {
				ok: true,
				data: note('n1', 'Roadmap', { body: 'Stale body' })
			})
		]);
		const preview = citationPreview(sources[0], [
			{ id: 'n1', title: 'Roadmap', body: 'Fresh live body' }
		]);
		expect(preview).toBe('Fresh live body');
	});

	it('falls back to the captured content when the record is gone', () => {
		const sources = collectCitations([
			entry('c1', 'get_note', { ok: true, data: note('n1', 'Roadmap', { body: 'Captured' }) })
		]);
		expect(citationPreview(sources[0], [])).toBe('Captured');
	});

	it('falls back to the description when nothing else is present', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', {
				ok: true,
				data: { notes: [note('n1', 'Roadmap', { excerpt: 'Only an excerpt' })] }
			})
		]);
		expect(citationPreview(sources[0], [])).toBe('Only an excerpt');
	});

	it('uses the live body even without captured content', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', { ok: true, data: { notes: [note('n1', 'Roadmap')] } })
		]);
		expect(citationPreview(sources[0], [{ id: 'n1', title: 'Roadmap', body: 'Live' }])).toBe(
			'Live'
		);
	});

	it('never reads a live body for a web source', () => {
		const sources = collectCitations([
			entry('c1', 'web_fetch', {
				ok: true,
				data: { url: 'https://example.com/a', text: 'Page text' }
			})
		]);
		// A same-id entity must not leak into a web preview.
		const preview = citationPreview(sources[0], [
			{ id: 'https://example.com/a', title: 'Docs', body: 'Not this' }
		]);
		expect(preview).toBe('Page text');
	});

	it('is empty when there is nothing to show', () => {
		const sources = collectCitations([
			entry('c1', 'search_notes', { ok: true, data: { notes: [note('n1', 'Roadmap')] } })
		]);
		expect(citationPreview(sources[0], [])).toBe('');
	});
});

describe('hostOf', () => {
	it('strips the scheme and a leading www', () => {
		expect(hostOf('https://www.example.com/a/b')).toBe('example.com');
	});

	it('falls back to the raw string for a non-url', () => {
		expect(hostOf('not a url')).toBe('not a url');
	});
});
