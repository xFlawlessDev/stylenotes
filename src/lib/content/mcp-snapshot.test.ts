import { describe, expect, it } from 'vitest';
import { createNote } from '$lib/content/content';
import { createTask, isTaskBlocked, type TaskDependency } from '$lib/stores/tasks';
import { buildMcpSnapshot, localDay, packSnapshotBodies } from '$lib/content/mcp-snapshot';
import { MCP_MAX_BODY_BYTES, MCP_PROTOCOL } from '$lib/content/mcp-types';

const workspaces = [{ id: 'workspace-default', name: 'Personal', color: 'primary', createdAt: '' }];

function build(overrides: Partial<Parameters<typeof buildMcpSnapshot>[0]> = {}) {
	return buildMcpSnapshot({
		notes: [],
		tasks: [],
		dependencies: [],
		folders: [],
		workspaces,
		revision: 1,
		appRunning: true,
		generatedAt: '2026-09-27T10:00:00.000Z',
		...overrides,
	});
}

describe('localDay', () => {
	// 18:00 UTC: still the 29th in UTC, already the 30th in Jakarta.
	const eveningUtc = new Date('2026-09-29T18:00:00.000Z');

	it('follows the configured zone, not UTC', () => {
		expect(localDay(eveningUtc, 'Asia/Jakarta')).toBe('2026-09-30');
		expect(localDay(eveningUtc, 'UTC')).toBe('2026-09-29');
	});

	it('goes back a day for zones west of UTC', () => {
		// 02:00 UTC on the 29th is still the 28th in Los Angeles.
		const earlyUtc = new Date('2026-09-29T02:00:00.000Z');
		expect(localDay(earlyUtc, 'America/Los_Angeles')).toBe('2026-09-28');
	});

	it('handles a half-hour offset zone', () => {
		// Kolkata is +05:30, so the local day rolls over at 18:30 UTC.
		expect(localDay(new Date('2026-09-29T18:30:00.000Z'), 'Asia/Kolkata')).toBe('2026-09-30');
		expect(localDay(new Date('2026-09-29T18:29:00.000Z'), 'Asia/Kolkata')).toBe('2026-09-29');
	});

	it('follows DST rather than a fixed offset', () => {
		// London is UTC in winter and +01:00 in summer.
		expect(localDay(new Date('2026-01-15T23:30:00.000Z'), 'Europe/London')).toBe('2026-01-15');
		expect(localDay(new Date('2026-07-15T23:30:00.000Z'), 'Europe/London')).toBe('2026-07-16');
	});

	it('falls back to the UTC day for an empty or unknown zone', () => {
		expect(localDay(eveningUtc, '')).toBe('2026-09-29');
		expect(localDay(eveningUtc, undefined)).toBe('2026-09-29');
		// A user-typed value the runtime does not know must not break a read.
		expect(localDay(eveningUtc, 'Mars/Olympus_Mons')).toBe('2026-09-29');
	});

	it('always produces the YYYY-MM-DD shape dueAt uses', () => {
		for (const zone of ['Asia/Jakarta', 'America/Los_Angeles', 'UTC', 'Asia/Kolkata']) {
			expect(localDay(eveningUtc, zone)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});
});

describe('buildMcpSnapshot', () => {
	it('carries the day the caller passed, not the UTC day', () => {
		const snapshot = build({ today: '2026-09-30' });
		expect(snapshot.today).toBe('2026-09-30');
		// `generatedAt` stays the full UTC timestamp; only `today` is the civil day.
		expect(snapshot.generatedAt).toBe('2026-09-27T10:00:00.000Z');
	});

	it('defaults `today` to the UTC day when the caller omits it', () => {
		expect(build().today).toBe('2026-09-27');
	});

	it('never exposes the display `updated` column', () => {
		const note = createNote({ id: 'n1', title: 'A', updated: 'Baru saja' });
		const snapshot = build({ notes: [note] });
		expect(snapshot.notes[0]).not.toHaveProperty('updated');
		expect(snapshot.notes[0]).toHaveProperty('updatedAt');
	});

	it('precomputes blocked state exactly like isTaskBlocked', () => {
		const tasks = [
			createTask({ id: 'a', title: 'A', status: 'todo', workspaceId: 'workspace-default' }),
			createTask({ id: 'b', title: 'B', status: 'done', workspaceId: 'workspace-default' }),
			createTask({ id: 'c', title: 'C', status: 'todo', workspaceId: 'workspace-default' }),
		];
		const dependencies: TaskDependency[] = [
			{ taskId: 'a', dependsOnTaskId: 'b' },
			{ taskId: 'a', dependsOnTaskId: 'c' },
		];
		const snapshot = build({ tasks, dependencies });
		const a = snapshot.tasks.find((task) => task.id === 'a')!;
		expect(a.blocked).toBe(isTaskBlocked(tasks[0], tasks, dependencies));
		expect(a.blockedBy.sort()).toEqual(['b', 'c']);
		const b = snapshot.tasks.find((task) => task.id === 'b')!;
		expect(b.blocking).toEqual(['a']);
		expect(b.blocked).toBe(false);
	});

	it('embeds a graph whose nodes carry the workspace', () => {
		const note = createNote({ id: 'n1', title: 'A', body: '[[B]]' });
		const other = createNote({ id: 'n2', title: 'B' });
		const snapshot = build({ notes: [note, other] });
		expect(snapshot.graph.nodes.map((node) => node.id)).toEqual(['note:n1', 'note:n2']);
		expect(snapshot.graph.edges).toHaveLength(1);
		expect(snapshot.graph.nodes[0].workspaceId).toBe('workspace-default');
	});

	/**
	 * The regression this replaced: one note over the old 500 KB flag threw
	 * *every* body out of the snapshot, so the model saw titles and excerpts
	 * for the whole workspace because of a single fat note.
	 */
	it('flags an oversized body instead of dropping every body', () => {
		const huge = 'x'.repeat(600 * 1024);
		const big = createNote({ id: 'big', title: 'Big', body: huge });
		const small = createNote({ id: 'small', title: 'Small', body: 'keep me' });
		const snapshot = build({ notes: [big, small] });

		expect(snapshot.truncated).toBe(true);
		expect(snapshot.truncatedReason).toBe('body_size');
		// Not index-only: the other note still has its text.
		expect(snapshot.indexOnly).toBe(false);
		expect(snapshot.notes.find((note) => note.id === 'small')!.body).toBe('keep me');

		const capped = snapshot.notes.find((note) => note.id === 'big')!;
		expect(capped.truncated).toBe(true);
		expect(new TextEncoder().encode(capped.body!).length).toBeLessThanOrEqual(MCP_MAX_BODY_BYTES);
	});

	it('caps a single note body under the byte limit and says so', () => {
		const large = 'word '.repeat(120_000); // ~600 KB
		const note = createNote({ id: 'large', title: 'Large', body: large });
		const snapshot = build({ notes: [note] });
		// The cut is announced on the note, never silently served as "all of it".
		expect(snapshot.notes[0].truncated).toBe(true);
		expect(snapshot.notes[0].body!.length).toBeLessThanOrEqual(MCP_MAX_BODY_BYTES);
		expect(snapshot.indexOnly).toBe(false);
	});

	it('keeps small snapshots intact', () => {
		const note = createNote({ id: 'n1', title: 'A', body: 'hello' });
		const snapshot = build({ notes: [note] });
		expect(snapshot.truncated).toBe(false);
		expect(snapshot.indexOnly).toBe(false);
		expect(snapshot.notes[0].body).toBe('hello');
		// Asserts the constant, not a literal: a protocol bump should not need
		// this test edited, and a snapshot that reports the wrong version is a
		// `protocol_mismatch` at the shim.
		expect(snapshot.protocol).toBe(MCP_PROTOCOL);
		expect(snapshot.appRunning).toBe(true);
	});
});

describe('packSnapshotBodies', () => {
	const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

	const snapshotWith = () =>
		build({
			notes: [
				createNote({ id: 'tiny', title: 'Tiny', body: 'tiny body' }),
				createNote({ id: 'mid', title: 'Mid', body: 'y'.repeat(2000) }),
				createNote({ id: 'big', title: 'Big', body: 'x'.repeat(4000) })
			]
		});

	it('drops the largest body first so the most notes keep their text', () => {
		const snapshot = snapshotWith();
		// 1 KB over the full size: only the fattest body can pay for that.
		const budget = bytes(snapshot) - 1000;
		const packed = packSnapshotBodies(snapshot, budget);

		expect(packed.truncated).toBe(true);
		expect(packed.truncatedReason).toBe('snapshot_size');
		expect(packed.indexOnly).toBe(false);
		expect(packed.notes.find((note) => note.id === 'big')!.body).toBeUndefined();
		expect(packed.notes.find((note) => note.id === 'big')!.truncated).toBe(true);
		expect(packed.notes.find((note) => note.id === 'mid')!.body).toBe('y'.repeat(2000));
		expect(packed.notes.find((note) => note.id === 'tiny')!.body).toBe('tiny body');
		expect(bytes(packed)).toBeLessThanOrEqual(budget);
	});

	it('falls back to index-only when the budget cannot hold a single body', () => {
		const packed = packSnapshotBodies(snapshotWith(), 200);
		expect(packed.indexOnly).toBe(true);
		expect(packed.truncated).toBe(true);
		for (const note of packed.notes) {
			expect(note.body).toBeUndefined();
			expect(note.truncated).toBe(true);
		}
	});

	it('returns the snapshot untouched when it already fits', () => {
		const snapshot = snapshotWith();
		expect(packSnapshotBodies(snapshot, 1_000_000)).toBe(snapshot);
	});
});
