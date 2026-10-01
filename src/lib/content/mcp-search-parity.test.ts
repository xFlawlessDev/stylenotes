import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	NOTE_BODY_WEIGHT,
	NOTE_EXCERPT_WEIGHT,
	NOTE_TAGS_WEIGHT,
	NOTE_TITLE_WEIGHT,
	TASK_NOTES_WEIGHT,
	TASK_TITLE_WEIGHT
} from '$lib/content/search-rank';

/**
 * The shim ranks search hits in Rust (`src-tauri/src/mcp/rank.rs`) because it
 * cannot call the app's TypeScript. The weights are therefore written twice on
 * purpose, and this test is what keeps the two copies equal.
 */
function parseRustWeights(source: string): Record<string, number> {
	const weights: Record<string, number> = {};
	const pattern = /pub const ([A-Z_]+): i64 = (\d+);/g;
	let match = pattern.exec(source);
	while (match) {
		weights[match[1]] = Number(match[2]);
		match = pattern.exec(source);
	}
	return weights;
}

describe('search ranking parity', () => {
	it('matches the Rust rank.rs weights exactly', () => {
		const source = readFileSync('src-tauri/src/mcp/rank.rs', 'utf8');
		expect(parseRustWeights(source)).toEqual({
			NOTE_TITLE_WEIGHT,
			NOTE_TAGS_WEIGHT,
			NOTE_EXCERPT_WEIGHT,
			NOTE_BODY_WEIGHT,
			TASK_TITLE_WEIGHT,
			TASK_NOTES_WEIGHT
		});
	});

	it('orders the note weights title > tags > excerpt > body', () => {
		expect(NOTE_TITLE_WEIGHT).toBeGreaterThan(NOTE_TAGS_WEIGHT);
		expect(NOTE_TAGS_WEIGHT).toBeGreaterThan(NOTE_EXCERPT_WEIGHT);
		expect(NOTE_EXCERPT_WEIGHT).toBeGreaterThan(NOTE_BODY_WEIGHT);
	});

	it('orders the task weights title > notes', () => {
		expect(TASK_TITLE_WEIGHT).toBeGreaterThan(TASK_NOTES_WEIGHT);
	});
});
