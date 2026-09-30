import { describe, expect, it } from 'vitest';
import {
	countWikilinks,
	folderForPath,
	normalizeTag,
	parseFrontmatter,
	planImport,
	resolveConflicts,
	titleForFile,
	type MarkdownFile,
} from '$lib/content/markdown-import';

const file = (path: string, content = ''): MarkdownFile => ({ path, content });

describe('parseFrontmatter', () => {
	it('reads scalar and inline-list values', () => {
		const { data, body } = parseFrontmatter('---\ntitle: Graph RAG\ntags: [ai, notes]\n---\nBody here');
		expect(data.title).toBe('Graph RAG');
		expect(data.tags).toEqual(['ai', 'notes']);
		expect(body).toBe('Body here');
	});

	it('leaves a file without frontmatter untouched', () => {
		const { data, body } = parseFrontmatter('# Heading\nText');
		expect(data).toEqual({});
		expect(body).toBe('# Heading\nText');
	});

	it('strips surrounding quotes', () => {
		const { data } = parseFrontmatter('---\ntitle: "Quoted"\n---\n');
		expect(data.title).toBe('Quoted');
	});
});

describe('titleForFile', () => {
	it('prefers a frontmatter title', () => {
		expect(titleForFile(file('a/b.md', ''), { title: 'Real Title' })).toBe('Real Title');
	});

	it('falls back to the basename without the extension', () => {
		expect(titleForFile(file('Ideas/Graph RAG.md', ''), {})).toBe('Graph RAG');
	});

	it('never returns an empty title', () => {
		expect(titleForFile(file('.md', ''), {})).toBe('Untitled note');
	});
});

describe('folderForPath', () => {
	it('uses the top directory, slugged', () => {
		expect(folderForPath('Work Notes/Projects/a.md')).toBe('work-notes');
	});

	it('files a root-level file under inbox', () => {
		expect(folderForPath('readme.md')).toBe('inbox');
	});
});

describe('normalizeTag', () => {
	it('drops a leading hash and lowercases', () => {
		expect(normalizeTag('#Machine Learning')).toBe('machine-learning');
	});
});

describe('countWikilinks', () => {
	it('counts embedded and plain wikilinks', () => {
		expect(countWikilinks('See [[A]] and ![[B]]')).toBe(2);
	});

	it('is zero when there are none', () => {
		expect(countWikilinks('plain text')).toBe(0);
	});
});

describe('planImport', () => {
	it('keeps wikilinks and frontmatter tags intact', () => {
		const plan = planImport([
			file('Ideas/Graph RAG.md', '---\ntags: [ai, retrieval]\n---\nSee [[Vector Search]].')
		]);
		expect(plan.notes).toHaveLength(1);
		expect(plan.notes[0].title).toBe('Graph RAG');
		expect(plan.notes[0].folder).toBe('ideas');
		expect(plan.notes[0].body).toContain('[[Vector Search]]');
		expect(plan.notes[0].tags).toEqual(['ai', 'retrieval']);
		expect(plan.stats.wikilinks).toBe(1);
		expect(plan.stats.tags).toBe(2);
	});

	it('reports a title conflict instead of merging', () => {
		const plan = planImport([file('a.md', 'body')], new Set(['a']));
		expect(plan.conflicts).toHaveLength(1);
		expect(plan.notes).toHaveLength(1);
	});

	it('skips an empty unnamed file and says why', () => {
		const plan = planImport([file('.md', '')]);
		expect(plan.skipped).toEqual([{ sourcePath: '.md', reason: 'empty' }]);
		expect(plan.notes).toHaveLength(0);
	});

	it('collects the distinct folders in use', () => {
		const plan = planImport([file('ai/a.md', 'x'), file('ai/b.md', 'y'), file('work/c.md', 'z')]);
		expect(plan.stats.folders).toEqual(['ai', 'work']);
	});
});

describe('resolveConflicts', () => {
	const plan: ReturnType<typeof planImport> = planImport(
		[file('Keep.md', 'one'), file('New.md', 'two')],
		new Set(['keep'])
	);

	it('skips conflicted notes under the skip policy', () => {
		const notes = resolveConflicts(plan, 'skip');
		expect(notes.map((note) => note.title)).toEqual(['New']);
	});

	it('duplicates conflicted notes with a suffix', () => {
		const notes = resolveConflicts(plan, 'duplicate');
		expect(notes.map((note) => note.title).sort()).toEqual(['Keep (imported)', 'New']);
	});

	it('never drops a non-conflicting note', () => {
		expect(resolveConflicts(plan, 'skip').some((note) => note.title === 'New')).toBe(true);
	});
});
