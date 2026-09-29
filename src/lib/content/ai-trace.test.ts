import { describe, expect, it } from 'vitest';
import type { AiToolCall } from '$lib/content/ai-types';
import {
	prettyArguments,
	reasoningLabel,
	toolResultSummary,
	toolStatusLabel,
	toolTraceFromRecord,
	toolTraceStatus,
	type ToolTraceEntry
} from '$lib/content/ai-trace';

const call = (id: string, name = 'list_notes', args = '{}'): AiToolCall => ({ id, name, arguments: args });

describe('toolTraceStatus', () => {
	it('reports a call with no result as still running', () => {
		expect(toolTraceStatus(undefined)).toBe('running');
	});

	it('splits ok from failed results', () => {
		expect(toolTraceStatus({ ok: true, data: [] })).toBe('done');
		expect(toolTraceStatus({ ok: false, error: 'nope' })).toBe('failed');
	});
});

describe('toolStatusLabel', () => {
	it('has a label for every status', () => {
		expect(toolStatusLabel('running')).toBe('Running');
		expect(toolStatusLabel('done')).toBe('Done');
		expect(toolStatusLabel('failed')).toBe('Failed');
		expect(toolStatusLabel('interrupted')).toBe('Interrupted');
	});
});

describe('toolResultSummary', () => {
	it('is empty while the call has not finished', () => {
		expect(toolResultSummary(undefined)).toBe('');
	});

	it('surfaces the error text on failure', () => {
		expect(toolResultSummary({ ok: false, error: 'Unknown tool' })).toBe('Unknown tool');
	});

	it('counts array results', () => {
		expect(toolResultSummary({ ok: true, data: [{ id: 'a' }] })).toBe('1 item');
		expect(toolResultSummary({ ok: true, data: [{ id: 'a' }, { id: 'b' }] })).toBe('2 items');
	});

	/** A title is the most useful one-line hint for a note or task result. */
	it('prefers a title over other object fields', () => {
		expect(toolResultSummary({ ok: true, data: { title: 'Roadmap', id: 'n1' } })).toBe('Roadmap');
	});

	it('falls back to a field count for an unlabelled object', () => {
		expect(toolResultSummary({ ok: true, data: { a: 1, b: 2 } })).toBe('2 fields');
	});

	it('passes a plain string through', () => {
		expect(toolResultSummary({ ok: true, data: 'hello' })).toBe('hello');
	});
});

describe('prettyArguments', () => {
	it('indents valid JSON', () => {
		expect(prettyArguments('{"id":"n1"}')).toBe('{\n  "id": "n1"\n}');
	});

	it('shows an empty object for blank input', () => {
		expect(prettyArguments('   ')).toBe('{}');
	});

	/** A half-written tool call should still be readable, not throw. */
	it('shows invalid JSON verbatim', () => {
		expect(prettyArguments('{"id":')).toBe('{"id":');
	});
});

describe('toolTraceFromRecord', () => {
	it('rejoins stored calls with their results', () => {
		const entries = toolTraceFromRecord(
			[call('c1'), call('c2', 'get_note')],
			{ c1: { ok: true, data: [] } }
		);
		expect(entries).toHaveLength(2);
		expect(entries[0].result).toEqual({ ok: true, data: [] });
		// A call the app never answered stays unanswered rather than vanishing.
		expect(entries[1].result).toBeUndefined();
	});
});

describe('reasoningLabel', () => {
	it('says it is thinking while the stream runs', () => {
		expect(reasoningLabel(true, 0)).toBe('Thinking…');
	});

	it('reports a measured duration once it stops', () => {
		expect(reasoningLabel(false, 1)).toBe('Thought for 1 second');
		expect(reasoningLabel(false, 4)).toBe('Thought for 4 seconds');
	});

	it('does not claim a duration it never measured', () => {
		expect(reasoningLabel(false, 0)).toBe('Thought quickly');
	});
});

/** Guards the shape the components iterate over. */
describe('ToolTraceEntry', () => {
	it('carries the call and an optional result', () => {
		const entry: ToolTraceEntry = { call: call('c1'), result: { ok: true, data: null } };
		expect(entry.call.id).toBe('c1');
	});
});
