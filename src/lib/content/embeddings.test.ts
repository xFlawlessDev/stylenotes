import { describe, expect, it } from 'vitest';
import {
	contentHash,
	cosine,
	decodeVector,
	decodeVectorBase64,
	embedText,
	encodeVector,
	encodeVectorBase64,
	hashMatches,
	hashingEmbed,
	toVectorBytes,
} from '$lib/content/embeddings';
import { MEMORY_HASHING_EMBEDDER } from '$lib/content/memory-types';

describe('embedText', () => {
	it('leads with the title and appends tags then body', () => {
		const text = embedText({ kind: 'note', title: 'Vector search', body: 'Body here', tags: ['rag'] });
		expect(text.split('\n')).toEqual(['Vector search', 'rag', 'Body here']);
	});

	it('skips empty parts', () => {
		expect(embedText({ kind: 'note', title: '', body: 'only body' })).toBe('only body');
	});

	it('is stable for the same input', () => {
		const source = { kind: 'note' as const, title: 'A', body: 'B', tags: ['c'] };
		expect(embedText(source)).toBe(embedText(source));
	});
});

describe('contentHash', () => {
	it('is stable for the same text', () => {
		expect(contentHash('hello world')).toBe(contentHash('hello world'));
	});

	it('changes when the text changes', () => {
		expect(contentHash('hello world')).not.toBe(contentHash('hello worlds'));
	});

	it('is a 16-character hex string', () => {
		expect(contentHash('anything')).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe('hashMatches', () => {
	const text = 'some note text';
	const embedder = MEMORY_HASHING_EMBEDDER;

	it('accepts a fresh vector', () => {
		expect(
			hashMatches(
				{ contentHash: contentHash(text), model: embedder.id, dim: embedder.dim },
				text,
				embedder
			)
		).toBe(true);
	});

	it('rejects a changed body', () => {
		expect(
			hashMatches(
				{ contentHash: contentHash('other'), model: embedder.id, dim: embedder.dim },
				text,
				embedder
			)
		).toBe(false);
	});

	it('rejects a vector from another model', () => {
		expect(
			hashMatches(
				{ contentHash: contentHash(text), model: 'provider:other', dim: embedder.dim },
				text,
				embedder
			)
		).toBe(false);
	});

	it('rejects a different dimension', () => {
		expect(
			hashMatches(
				{ contentHash: contentHash(text), model: embedder.id, dim: 1536 },
				text,
				embedder
			)
		).toBe(false);
	});
});

describe('vector codec', () => {
	it('round-trips with f32 tolerance', () => {
		const original = [0.5, -1.25, 3.0, 0.0];
		const decoded = decodeVector(encodeVector(original));
		expect(decoded).toHaveLength(original.length);
		decoded.forEach((value, index) => expect(value).toBeCloseTo(original[index], 5));
	});

	it('packs four bytes per float', () => {
		expect(encodeVector([1, 2, 3]).byteLength).toBe(12);
	});

	it('rejects a misaligned byte length', () => {
		expect(() => decodeVector(new Uint8Array([1, 2, 3]))).toThrow();
	});
});

describe('toVectorBytes', () => {
	it('accepts a byte array of exactly dim*4', () => {
		const bytes = encodeVector([1, 2, 3, 4]);
		expect(toVectorBytes(bytes, 4)).toBe(bytes);
	});

	it('rejects a length that does not match the dimension', () => {
		// The bug this guards: a number array bound as text decodes to the wrong
		// number of floats, which silently poisons every similarity score.
		const wrong = new Uint8Array(1358 * 4);
		expect(toVectorBytes(wrong, 384)).toBeNull();
	});

	it('rejects a string (a vector stored as text by the SQL plugin)', () => {
		expect(toVectorBytes('123,456,789', 4)).toBeNull();
	});

	it('rejects a non-positive dimension', () => {
		expect(toVectorBytes(encodeVector([1, 2]), 0)).toBeNull();
	});

	it('accepts a plain number array of the right length', () => {
		const array = Array.from(encodeVector([1, 2, 3, 4]));
		const result = toVectorBytes(array, 4);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result?.byteLength).toBe(16);
	});
});

describe('base64 vector codec', () => {
	it('round-trips a vector exactly', () => {
		const original = Array.from({ length: 384 }, (_, index) => Math.sin(index));
		const encoded = encodeVectorBase64(original);
		const decoded = decodeVectorBase64(encoded, 384);
		expect(decoded).not.toBeNull();
		decoded!.forEach((value, index) => expect(value).toBeCloseTo(original[index], 5));
	});

	it('is smaller than a JSON number array of the same vector', () => {
		const original = Array.from({ length: 384 }, (_, index) => index / 384);
		const encoded = encodeVectorBase64(original);
		expect(encoded.length).toBeLessThan(JSON.stringify(original).length);
	});

	it('rejects a payload whose length does not match the dimension', () => {
		const encoded = encodeVectorBase64([1, 2, 3, 4]);
		expect(decodeVectorBase64(encoded, 384)).toBeNull();
	});

	it('rejects a non-string (a row stored by the old number-array binding)', () => {
		expect(decodeVectorBase64([1, 2, 3], 4)).toBeNull();
		expect(decodeVectorBase64(null, 4)).toBeNull();
	});

	it('rejects invalid base64', () => {
		expect(decodeVectorBase64('not base64!!', 4)).toBeNull();
	});
});

describe('cosine', () => {
	it('is 1 for identical vectors', () => {
		expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
	});

	it('is 0 for orthogonal vectors', () => {
		expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
	});

	it('returns 0 for mismatched lengths or zero vectors', () => {
		expect(cosine([1], [1, 2])).toBe(0);
		expect(cosine([0, 0], [1, 1])).toBe(0);
	});
});

describe('hashingEmbed', () => {
	it('is deterministic', () => {
		expect(hashingEmbed('some text')).toEqual(hashingEmbed('some text'));
	});

	it('produces a unit vector of the right dimension', () => {
		const vec = hashingEmbed('a reasonably long sentence here');
		expect(vec).toHaveLength(MEMORY_HASHING_EMBEDDER.dim);
		const magnitude = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
		expect(magnitude).toBeCloseTo(1, 5);
	});

	it('scores lexical overlap higher than an unrelated text', () => {
		const base = hashingEmbed('vector database retrieval notes');
		const near = hashingEmbed('retrieval from a vector database');
		const far = hashingEmbed('banana bread recipe with walnuts');
		expect(cosine(base, near)).toBeGreaterThan(cosine(base, far));
	});

	it('returns the zero vector for blank text', () => {
		expect(hashingEmbed('   ').every((value) => value === 0)).toBe(true);
	});
});
