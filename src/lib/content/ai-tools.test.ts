import { describe, expect, it, vi } from 'vitest';

const writeActions = vi.hoisted(() => ({
	createNoteAction: vi.fn(),
	updateNoteBodyAction: vi.fn(),
	deleteNoteAction: vi.fn(),
	createTaskAction: vi.fn(),
	updateTaskAction: vi.fn(),
	completeTaskAction: vi.fn(),
	deleteTaskAction: vi.fn()
}));

vi.mock('$lib/content/mcp-write-actions', () => ({
	...writeActions,
	fail: (error: string, message: string) => ({ ok: false, error, message })
}));

import { executeToolCall, describeToolCall, type ToolContext } from '$lib/content/ai-tools';
import { toolDefinitions, toolLabel } from '$lib/content/ai-tool-schema';
import type { AnsweredQuestion, QuestionItem } from '$lib/content/ai-questions';
import type { McpSnapshot } from '$lib/content/mcp-types';

function snapshot(): McpSnapshot {
	return {
		protocol: 1,
		revision: 1,
		generatedAt: '2026-01-01',
		today: '2026-01-01',
		truncated: false,
		appRunning: true,
		workspaces: [{ id: 'w1', name: 'Main' }],
		notes: [
			{
				id: 'n1',
				workspaceId: 'w1',
				title: 'Roadmap',
				folder: 'work',
				tags: ['plan'],
				pinned: true,
				overlay: false,
				excerpt: 'The plan',
				body: 'Full roadmap body',
				createdAt: 0,
				updatedAt: 100
			},
			{
				id: 'n2',
				workspaceId: 'w1',
				title: 'Notes about coffee',
				folder: 'personal',
				tags: [],
				pinned: false,
				overlay: false,
				excerpt: 'beans',
				body: 'I like beans',
				createdAt: 0,
				updatedAt: 200
			}
		],
		tasks: [
			{
				id: 't1',
				workspaceId: 'w1',
				title: 'Ship it',
				notes: '',
				status: 'doing',
				priority: 'high',
				folder: 'work',
				noteIds: ['n1'],
				startAt: null,
				dueAt: '2026-01-05',
				position: 0,
				completed: false,
				overlay: false,
				blocked: false,
				blockedBy: [],
				blocking: []
			}
		],
		dependencies: [],
		folders: [],
		graph: {
			nodes: [
				{ id: 'note:n1', entityId: 'n1', kind: 'note', workspaceId: 'w1', title: 'Roadmap', folder: 'work', orphan: false, degree: 1 },
				{ id: 'task:t1', entityId: 't1', kind: 'task', workspaceId: 'w1', title: 'Ship it', folder: 'work', orphan: false, degree: 1 }
			],
			edges: [{ id: 'e1', source: 'task:t1', target: 'note:n1', kind: 'link' }]
		}
	};
}

function context(): ToolContext {
	return {
		snapshot: snapshot(),
		write: { notes: [], tasks: [], dependencies: [], workspaceIds: new Set(['w1']) }
	};
}

describe('read tools', () => {
	it('lists notes filtered by tag', async () => {
		const result = await executeToolCall(context(), 'list_notes', '{"tag":"plan"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { notes: unknown[] }).notes).toHaveLength(1);
	});

	it('searches titles and bodies', async () => {
		const result = await executeToolCall(context(), 'search_notes', '{"query":"beans"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const notes = (result.data as { notes: { ref: string }[] }).notes;
		expect(notes[0].ref).toBe('w1/n2');
	});

	it('returns a note body and its links', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"n1"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const data = result.data as { body: string; links: unknown[] };
		expect(data.body).toBe('Full roadmap body');
		expect(data.links).toHaveLength(1);
	});

	it('errors on an unknown note id', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"nope"}', { confirmed: false });
		expect(result.ok).toBe(false);
	});

	it('falls back to a title when given one instead of an id', async () => {
		const result = await executeToolCall(context(), 'get_note', '{"id":"Roadmap"}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { title: string }).title).toBe('Roadmap');
	});

	it('errors on an unknown task id', async () => {
		const result = await executeToolCall(context(), 'get_task', '{"id":"nope"}', { confirmed: false });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('list_tasks');
	});

	it('sorts tasks priority-first', async () => {
		const result = await executeToolCall(context(), 'list_tasks', '{}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.data as { tasks: unknown[] }).tasks).toHaveLength(1);
	});

	it('errors on invalid JSON arguments', async () => {
		const result = await executeToolCall(context(), 'list_notes', '{not json', { confirmed: false });
		expect(result).toEqual({ ok: false, error: 'Tool arguments were not valid JSON.' });
	});

	it('errors on an unknown tool', async () => {
		const result = await executeToolCall(context(), 'nope', '{}', { confirmed: false });
		expect(result.ok).toBe(false);
	});
});

describe('write tools', () => {
	it('refuses an unconfirmed write', async () => {
		const result = await executeToolCall(context(), 'create_task', '{"title":"X"}', { confirmed: false });
		expect(result).toEqual({ ok: false, error: 'The user declined this action.' });
		expect(writeActions.createTaskAction).not.toHaveBeenCalled();
	});

	it('runs a confirmed write through the shared action', async () => {
		writeActions.createTaskAction.mockResolvedValue({ ok: true, data: { task: { id: 't9' } } });
		const result = await executeToolCall(context(), 'create_task', '{"title":"X"}', { confirmed: true });
		expect(result.ok).toBe(true);
		expect(writeActions.createTaskAction).toHaveBeenCalled();
	});

	it('requires confirm:true for delete', async () => {
		const result = await executeToolCall(context(), 'delete_task', '{"id":"t1"}', { confirmed: true });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('confirm');
		expect(writeActions.deleteTaskAction).not.toHaveBeenCalled();
	});
});

describe('toolDefinitions', () => {
	it('hides write tools without a write grant', () => {
		const read = toolDefinitions({ access: 'read', scopes: [] });
		expect(read.every((definition) => !definition.function.name.startsWith('create'))).toBe(true);
		expect(read.some((definition) => definition.function.name === 'list_notes')).toBe(true);
	});

	it('includes a write tool only when its scope is granted', () => {
		const tasks = toolDefinitions({ access: 'write', scopes: ['tasks'] });
		expect(tasks.some((d) => d.function.name === 'create_task')).toBe(true);
		expect(tasks.some((d) => d.function.name === 'create_note')).toBe(false);
	});
});

describe('describeToolCall', () => {
	it('names a create call with its title', () => {
		expect(describeToolCall('create_task', '{"title":"Ship"}')).toContain('Ship');
	});

	it('names a web search with its query', () => {
		expect(describeToolCall('web_search', '{"query":"svelte 5"}')).toContain('svelte 5');
	});

	it('names a web fetch with its url', () => {
		expect(describeToolCall('web_fetch', '{"url":"https://example.com"}')).toContain(
			'https://example.com'
		);
	});

	it('falls back to the raw name for unknown tools', () => {
		expect(describeToolCall('mystery', '{}')).toBe('mystery');
	});
});

describe('web tools', () => {
	it('reports search as unavailable without hooks', async () => {
		const result = await executeToolCall(context(), 'web_search', '{"query":"x"}', {
			confirmed: false
		});
		expect(result.ok).toBe(false);
	});

	it('requires a query before calling out', async () => {
		const search = vi.fn();
		const result = await executeToolCall(
			{ ...context(), web: { search, fetch: vi.fn() } },
			'web_search',
			'{}',
			{ confirmed: false }
		);
		expect(result.ok).toBe(false);
		expect(search).not.toHaveBeenCalled();
	});

	it('forwards a search to the web hooks', async () => {
		const search = vi.fn(async () => ({ ok: true as const, data: { count: 1 } }));
		const result = await executeToolCall(
			{ ...context(), web: { search, fetch: vi.fn() } },
			'web_search',
			'{"query":"svelte","limit":3}',
			{ confirmed: false }
		);
		expect(result.ok).toBe(true);
		expect(search).toHaveBeenCalledWith('svelte', 3);
	});

	/** Search defaults must reach the hook even when the model omits them. */
	it('defaults the search limit to 5', async () => {
		const search = vi.fn(async () => ({ ok: true as const, data: {} }));
		await executeToolCall(
			{ ...context(), web: { search, fetch: vi.fn() } },
			'web_search',
			'{"query":"x"}',
			{ confirmed: false }
		);
		expect(search).toHaveBeenCalledWith('x', 5);
	});

	it('forwards a fetch with its url', async () => {
		const fetch = vi.fn(async () => ({ ok: true as const, data: { text: 'hi' } }));
		const result = await executeToolCall(
			{ ...context(), web: { search: vi.fn(), fetch } },
			'web_fetch',
			'{"url":"https://example.com"}',
			{ confirmed: false }
		);
		expect(result.ok).toBe(true);
		expect(fetch).toHaveBeenCalledWith('https://example.com', 12_000);
	});

	/** Web tools are reads: they must never wait for a write confirmation. */
	it('runs without a write confirmation', async () => {
		const search = vi.fn(async () => ({ ok: true as const, data: {} }));
		const result = await executeToolCall(
			{ ...context(), web: { search, fetch: vi.fn() } },
			'web_search',
			'{"query":"x"}',
			{ confirmed: false }
		);
		expect(result.ok).toBe(true);
	});
});

describe('ask_user_question', () => {
	it('reports the tool as unavailable without an ask hook', async () => {
		const result = await executeToolCall(
			context(),
			'ask_user_question',
			JSON.stringify({
				questions: [
					{ question: 'q', header: 'H', options: [{ label: 'a' }, { label: 'b' }] }
				]
			}),
			{ confirmed: false }
		);
		expect(result.ok).toBe(false);
	});

	it('returns a validation error for malformed questions', async () => {
		const ask = vi.fn();
		const result = await executeToolCall(
			{ ...context(), ask },
			'ask_user_question',
			'{"questions":[]}',
			{ confirmed: false }
		);
		expect(result.ok).toBe(false);
		expect(ask).not.toHaveBeenCalled();
	});

	/** The call must not resolve until the user answers. */
	it('blocks until the answers arrive, then reports them', async () => {
		let settle: ((answers: AnsweredQuestion[]) => void) | undefined;
		const ask = vi.fn((_questions: QuestionItem[], resolve: (answers: AnsweredQuestion[]) => void) => {
			settle = resolve;
		});

		const pending = executeToolCall(
			{ ...context(), ask },
			'ask_user_question',
			JSON.stringify({
				questions: [
					{ question: 'Which?', header: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }
				]
			}),
			{ confirmed: false }
		);

		// Nothing is returned while the card is still open.
		const raced = await Promise.race([pending, Promise.resolve('pending' as const)]);
		expect(raced).toBe('pending');

		settle?.([
			{
				question: 'Which?',
				header: 'Pick',
				options: [{ label: 'A' }, { label: 'B' }],
				multiSelect: false,
				answer: { kind: 'option', answer: 'A' }
			}
		]);

		const result = await pending;
		expect(result.ok).toBe(true);
		if (result.ok) {
			const data = result.data as { answered: number; results: { answer: string }[] };
			expect(data.answered).toBe(1);
			expect(data.results[0].answer).toBe('A');
		}
	});
});

describe('toolLabel', () => {
	it('returns a human label', () => {
		expect(toolLabel('get_note')).toBe('Read note');
	});
});

describe('semantic tools', () => {
	it('reports "not ready" for semantic_search without a memory hook', async () => {
		const result = await executeToolCall(context(), 'semantic_search', '{"query":"roadmap"}', {
			confirmed: false
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('search_notes');
	});

	it('ranks hits and references them when memory is available', async () => {
		const withMemory: ToolContext = {
			...context(),
			memory: {
				ready: () => true,
				search: async () => [{ entityKind: 'note', entityId: 'n1', score: 0.91234 }],
				related: async () => [
					{ entityKind: 'task', entityId: 't1', score: 0.8 },
					{ entityKind: 'note', entityId: 'n1', score: 0.5 }
				],
				themes: async () => [],
				contradictions: async () => []
			}
		};
		const search = await executeToolCall(withMemory, 'semantic_search', '{"query":"road"},', {
			confirmed: false
		});
		// Malformed JSON is rejected before the hook runs.
		expect(search.ok).toBe(false);

		const good = await executeToolCall(withMemory, 'semantic_search', '{"query":"roadmap"}', {
			confirmed: false
		});
		expect(good.ok).toBe(true);
		if (good.ok) {
			const results = (good.data as { results: { ref: string; score: number }[] }).results;
			expect(results[0].ref).toBe('w1/n1');
			expect(results[0].score).toBeCloseTo(0.9123, 3);
		}
	});

	it('related_notes resolves the entity id and returns its neighbours', async () => {
		const withMemory: ToolContext = {
			...context(),
			memory: {
				ready: () => true,
				search: async () => [],
				related: async () => [{ entityKind: 'task', entityId: 't1', score: 0.7 }],
				themes: async () => [{ label: 'Roadmaps', members: [{ entityKind: 'note', entityId: 'n1', score: 0.9 }] }],
				contradictions: async () => []
			}
		};
		const result = await executeToolCall(withMemory, 'related_notes', '{"id":"n1"}', {
			confirmed: false
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const results = (result.data as { results: { kind: string; ref: string }[] }).results;
			expect(results[0].kind).toBe('task');
			expect(results[0].ref).toBe('w1/t1');
		}
	});

	it('related_notes reports "not ready" without memory', async () => {
		const result = await executeToolCall(context(), 'related_notes', '{"id":"n1"}', {
			confirmed: false
		});
		expect(result.ok).toBe(false);
	});

	it('list_themes names clusters and their members', async () => {
		const withMemory: ToolContext = {
			...context(),
			memory: {
				ready: () => true,
				search: async () => [],
				related: async () => [],
				themes: async () => [
					{ label: 'Vector retrieval', members: [{ entityKind: 'note', entityId: 'n1', score: 0.9 }] }
				],
				contradictions: async () => []
			}
		};
		const result = await executeToolCall(withMemory, 'list_themes', '{}', { confirmed: false });
		expect(result.ok).toBe(true);
		if (result.ok) {
			const themes = (result.data as { themes: { label: string; members: { ref: string }[] }[] })
				.themes;
			expect(themes[0].label).toBe('Vector retrieval');
			expect(themes[0].members[0].ref).toBe('w1/n1');
		}
	});

	it('list_themes reports "not ready" without memory', async () => {
		const result = await executeToolCall(context(), 'list_themes', '{}', { confirmed: false });
		expect(result.ok).toBe(false);
	});

	it('find_contradictions reports verified pairs', async () => {
		const withMemory: ToolContext = {
			...context(),
			memory: {
				ready: () => true,
				search: async () => [],
				related: async () => [],
				themes: async () => [],
				contradictions: async () => [
					{
						label: 'One says up, the other down',
						members: [
							{ entityKind: 'note', entityId: 'n1', score: 0.8 },
							{ entityKind: 'task', entityId: 't1', score: 0.8 }
						]
					}
				]
			}
		};
		const result = await executeToolCall(withMemory, 'find_contradictions', '{}', {
			confirmed: false
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			const pairs = (result.data as { pairs: { reason: string; members: { ref: string }[] }[] })
				.pairs;
			expect(pairs[0].reason).toContain('up');
			expect(pairs[0].members.map((member) => member.ref)).toEqual(['w1/n1', 'w1/t1']);
		}
	});

	it('find_contradictions reports "not ready" without memory', async () => {
		const result = await executeToolCall(context(), 'find_contradictions', '{}', {
			confirmed: false
		});
		expect(result.ok).toBe(false);
	});
});