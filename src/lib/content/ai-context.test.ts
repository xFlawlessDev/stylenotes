import { describe, expect, it } from 'vitest';
import { snapshotNotice } from '$lib/content/ai-context';
import { MCP_PROTOCOL, type McpSnapshot } from '$lib/content/mcp-types';

function snapshot(overrides: Partial<McpSnapshot> = {}): McpSnapshot {
	return {
		protocol: MCP_PROTOCOL,
		revision: 1,
		generatedAt: '2026-01-01T00:00:00.000Z',
		today: '2026-01-01',
		truncated: false,
		indexOnly: false,
		appRunning: true,
		workspaces: [],
		notes: [],
		tasks: [],
		dependencies: [],
		folders: [],
		graph: { nodes: [], edges: [] },
		...overrides
	};
}

describe('snapshotNotice', () => {
	it('costs nothing when nothing was left out', () => {
		expect(snapshotNotice(snapshot())).toBeNull();
	});

	/**
	 * The point of the whole feature: without this block a body withheld by
	 * the budget looks exactly like a note the user never wrote, and the
	 * model says so with full confidence.
	 */
	it('tells the model a trimmed note is not an empty one', () => {
		const notice = snapshotNotice(snapshot({ truncated: true, truncatedReason: 'body_size' }));
		expect(notice).toContain('body_size');
		expect(notice).toContain('not empty');
		expect(notice).toContain('cut short');
	});

	it('says outright when no body shipped at all', () => {
		const notice = snapshotNotice(
			snapshot({ truncated: true, indexOnly: true, truncatedReason: 'snapshot_size' })
		);
		expect(notice).toContain('snapshot_size');
		expect(notice).toContain('no note bodies at all');
		expect(notice).toContain('not empty');
	});

	it('warns about absent rows, not absent text, when a list was capped', () => {
		const notice = snapshotNotice(snapshot({ truncated: true, truncatedReason: 'note_count' }));
		expect(notice).toContain('note_count');
		expect(notice).toContain('missing entirely');
		expect(notice).not.toContain('cut short');
	});
});
