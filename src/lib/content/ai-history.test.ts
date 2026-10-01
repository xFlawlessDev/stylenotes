import { describe, expect, it } from 'vitest';
import { replayHistory, trimHistory, type StoredTurn } from '$lib/content/ai-history';
import type { AiMessage, AiToolCall } from '$lib/content/ai-types';

const user = (content: string): AiMessage => ({ role: 'user', content });
const assistant = (content: string): AiMessage => ({ role: 'assistant', content });
const system = (content: string): AiMessage => ({ role: 'system', content });
const tool = (id: string): AiMessage => ({ role: 'tool', content: 'result', toolCallId: id });

describe('trimHistory', () => {
	it('keeps a history that already fits untouched', () => {
		const messages = [system('context'), user('hi'), assistant('hello')];
		expect(trimHistory(messages, 20)).toEqual(messages);
	});

	it('drops the oldest turns and keeps the newest ones in order', () => {
		const messages = [user('1'), assistant('1'), user('2'), assistant('2'), user('3')];
		expect(trimHistory(messages, 2).map((message) => message.content)).toEqual(['2', '3']);
	});

	/**
	 * The regression this exists for: `@mention` bodies and the snapshot
	 * truncation notice are unshifted to the front, so a positional slice
	 * threw away the context for the question it was attached to.
	 */
	it('never drops system blocks, however old', () => {
		const messages = [
			system('note context: the body of Roadmap'),
			system('snapshot was trimmed'),
			...Array.from({ length: 40 }, (_, index) => user(`q${index}`))
		];
		const trimmed = trimHistory(messages, 5);
		expect(trimmed.filter((message) => message.role === 'system')).toHaveLength(2);
		expect(trimmed[0].content).toBe('note context: the body of Roadmap');
		expect(trimmed.at(-1)?.content).toBe('q39');
		expect(trimmed.filter((message) => message.role === 'user')).toHaveLength(5);
	});

	it('does not count system blocks against the cap', () => {
		const messages = [system('a'), system('b'), ...Array.from({ length: 6 }, (_, index) => user(`${index}`))];
		expect(trimHistory(messages, 4)).toHaveLength(6);
	});

	it('keeps an assistant/tool pair whole when the pair still fits', () => {
		const messages = [user('old'), assistant('running a tool'), tool('call-1'), user('next question')];
		const trimmed = trimHistory(messages, 3);
		expect(trimmed.map((message) => message.role)).toEqual(['assistant', 'tool', 'user']);
	});

	/**
	 * A leading `tool` turn has no assistant partner left — the provider
	 * answers an orphaned result with a 400, so it is dropped rather than
	 * sent. The stale text is gone either way; only validity differs.
	 */
	it('drops a tool turn whose assistant partner was trimmed away', () => {
		const messages = [assistant('running a tool'), tool('call-1'), user('next question')];
		const trimmed = trimHistory(messages, 2);
		expect(trimmed.some((message) => message.role === 'tool')).toBe(false);
		expect(trimmed).toEqual([user('next question')]);
	});

	it('treats a zero cap as "keep only system blocks"', () => {
		const trimmed = trimHistory([system('ctx'), user('hi')], 0);
		expect(trimmed).toEqual([system('ctx')]);
	});

	it('keeps the whole conversation when it is shorter than the cap', () => {
		const messages = Array.from({ length: 8 }, (_, index) => user(`${index}`));
		expect(trimHistory(messages, 20)).toEqual(messages);
	});
});

const call = (id: string, name = 'get_note'): AiToolCall => ({ id, name, arguments: '{}' });
const stored = (
	role: StoredTurn['role'],
	content: string,
	toolCalls: AiToolCall[] = [],
	toolResults: NonNullable<StoredTurn['toolResults']> = {}
): StoredTurn => ({ role, content, toolCalls, toolResults });

describe('replayHistory', () => {
	it('expands a stored turn into the call and one reply per result', () => {
		const messages = replayHistory([
			stored('user', 'what changed?'),
			stored(
				'assistant',
				'Two notes.',
				[call('c1', 'search_notes'), call('c2', 'search_notes')],
				{
					c1: { ok: true, data: { total: 2 } },
					c2: { ok: true, data: { total: 0 } }
				}
			)
		]);
		expect(messages.map((message) => message.role)).toEqual([
			'user',
			'assistant',
			'tool',
			'tool'
		]);
		expect(messages[1].toolCalls).toHaveLength(2);
		expect(messages.slice(2).map((message) => message.toolCallId)).toEqual(['c1', 'c2']);
	});

	it('sends a result as readable text rather than JSON', () => {
		const messages = replayHistory([
			stored('assistant', '', [call('c1')], { c1: { ok: true, data: { body: 'hello' } } })
		]);
		expect(messages[1].content).toBe('body: hello');
		expect(messages[1].content).not.toContain('"ok"');
	});

	it('reports a result that was never recorded instead of inventing one', () => {
		const messages = replayHistory([stored('assistant', 'reading…', [call('c1')])]);
		expect(messages).toHaveLength(2);
		expect(messages[1].content).toContain('no result was recorded');
	});

	it('leaves turns without tool traffic exactly as stored', () => {
		const messages = replayHistory([stored('user', 'hi'), stored('assistant', 'hello')]);
		expect(messages).toEqual([
			{ role: 'user', content: 'hi' },
			{ role: 'assistant', content: 'hello' }
		]);
	});

	/**
	 * The whole point of the budget: what the model is about to reason over
	 * keeps its text, and only the surplus of the past is cut.
	 */
	it('keeps the newest result whole and shrinks an older one', () => {
		const body = 'x'.repeat(500);
		const messages = replayHistory(
			[
				stored('user', 'first question'),
				stored('assistant', 'a', [call('c1')], { c1: { ok: true, data: { body } } }),
				stored('user', 'second question'),
				stored('assistant', 'b', [call('c2')], { c2: { ok: true, data: { body } } })
			],
			600
		);
		const [older, newest] = messages.filter((message) => message.role === 'tool');
		expect(newest.content).toContain(body);
		expect(newest.content).not.toContain('trimmed to fit');
		expect(older.content).toContain('trimmed to fit');
		expect(older.content.length).toBeLessThan(newest.content.length);
	});

	it('leaves a result alone when it already fits the head', () => {
		const messages = replayHistory([stored('assistant', '', [call('c1')], { c1: { ok: true, data: 'short' } })], 0);
		expect(messages[1].content).toBe('short');
	});

	it('cuts a long result to a marked head when the budget is spent', () => {
		const messages = replayHistory(
			[stored('assistant', '', [call('c1')], { c1: { ok: true, data: { body: 'y'.repeat(1000) } } })],
			0
		);
		expect(messages[1].content.startsWith('body:\n  yyyy')).toBe(true);
		expect(messages[1].content).toContain('trimmed to fit');
		expect(messages[1].content.length).toBeLessThan(1000);
	});
});
