import { describe, it, expect } from 'vitest';
import {
	catalogRows,
	filterCatalogRows,
	filterTrashRows,
	formatBytes,
	orphanIds,
	referenceId,
	totalBytes,
} from '$lib/content/attachment-manager';
import type { AttachmentRecord } from '$lib/db';

function record(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
	return {
		id: 'a'.repeat(64),
		ext: 'png',
		name: 'shot.png',
		size: 2048,
		relPath: `attachments/aa/${'a'.repeat(64)}.png`,
		hasLocalOrigin: true,
		createdAt: 1000,
		lastSeenAt: 1000,
		...overrides,
	};
}

describe('catalogRows', () => {
	it('orders newest first and builds a droppable reference', () => {
		const older = record({ id: 'b'.repeat(64), createdAt: 500, name: 'old.pdf', ext: 'pdf' });
		const newer = record({ id: 'c'.repeat(64), createdAt: 900, name: 'new.png' });
		const rows = catalogRows([older, newer]);
		expect(rows.map((row) => row.name)).toEqual(['new.png', 'old.pdf']);
		expect(rows[0].reference).toBe(`stylenotes-attachment://${'c'.repeat(64)}.png`);
		expect(rows[1].kind).toBe('pdf');
	});

	it('falls back to a short id when a blob has no name', () => {
		const rows = catalogRows([record({ name: '', ext: 'bin' })]);
		expect(rows[0].label).toBe(`${'a'.repeat(12)}.bin`);
	});
});

describe('orphanIds', () => {
	it('returns ids no note references', () => {
		const referenced = record({ id: 'r'.repeat(64) });
		const orphan = record({ id: 'o'.repeat(64) });
		expect(orphanIds([referenced, orphan], new Set(['r'.repeat(64)]))).toEqual(['o'.repeat(64)]);
	});

	it('treats an empty reference set as everything orphaned', () => {
		expect(orphanIds([record(), record({ id: 'z'.repeat(64) })], new Set())).toHaveLength(2);
	});
});

describe('formatBytes', () => {
	it('formats with binary units', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
		expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
	});

	it('handles missing and negative sizes as zero', () => {
		expect(formatBytes(-1)).toBe('0 B');
		expect(formatBytes(Number.NaN)).toBe('0 B');
	});
});

describe('totalBytes', () => {
	it('sums the catalog', () => {
		expect(totalBytes([record({ size: 100 }), record({ size: 250 })])).toBe(350);
	});
});

describe('referenceId', () => {
	it('extracts the id from a store reference only', () => {
		expect(referenceId(`stylenotes-attachment://${'a'.repeat(64)}.png`)).toBe('a'.repeat(64));
		expect(referenceId('https://x.test/a.png')).toBeNull();
		expect(referenceId('/a/b.png')).toBeNull();
	});
});

describe('filterCatalogRows', () => {
	const image = record({ id: 'i'.repeat(64), ext: 'png', name: 'shot.png' });
	const doc = record({ id: 'd'.repeat(64), ext: 'pdf', name: 'report.pdf' });

	it('keeps every row with no filter', () => {
		const rows = catalogRows([image, doc]);
		expect(filterCatalogRows(rows)).toHaveLength(2);
	});

	it('matches a kind filter', () => {
		const rows = catalogRows([image, doc]);
		expect(filterCatalogRows(rows, { kind: 'image' }).map((row) => row.id)).toEqual([
			'i'.repeat(64),
		]);
	});

	it('matches a search over the label and the id', () => {
		const rows = catalogRows([image, doc]);
		expect(filterCatalogRows(rows, { query: 'report' }).map((row) => row.id)).toEqual([
			'd'.repeat(64),
		]);
		expect(filterCatalogRows(rows, { query: 'i'.repeat(10) })).toHaveLength(1);
	});

	it('combines a query with a kind, and combines both with orphans', () => {
		const rows = catalogRows([image, doc]);
		expect(filterCatalogRows(rows, { kind: 'pdf', query: 'report' })).toHaveLength(1);
		expect(filterCatalogRows(rows, { query: 'report', kind: 'image' })).toHaveLength(0);
		expect(
			filterCatalogRows(rows, { kind: 'orphan', orphans: new Set(['i'.repeat(64)]) }).map(
				(row) => row.id
			)
		).toEqual(['i'.repeat(64)]);
	});
});

describe('filterTrashRows', () => {
	const items = [
		{ id: 'a'.repeat(64), ext: 'png', deletedAt: 2, size: 1 },
		{ id: 'b'.repeat(64), ext: 'pdf', deletedAt: 1, size: 1 },
	];

	it('returns every row with no query', () => {
		expect(filterTrashRows(items)).toHaveLength(2);
	});

	it('filters by name fragment and by kind', () => {
		expect(filterTrashRows(items, { query: 'b'.repeat(6) })).toHaveLength(1);
		expect(filterTrashRows(items, { kind: 'pdf' }).map((item) => item.id)).toEqual([
			'b'.repeat(64),
		]);
		expect(filterTrashRows(items, { kind: 'pdf', query: 'a'.repeat(6) })).toHaveLength(0);
	});
});
