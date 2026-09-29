import { describe, expect, it } from 'vitest';
import { extractSvgText } from '$lib/content/mermaid-export';

describe('extractSvgText', () => {
	it('adds the SVG namespace and viewBox dimensions', () => {
		const result = extractSvgText('<svg viewBox="0 0 320 180"><path d="M0 0" /></svg>');
		expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(result).toContain('width="320"');
		expect(result).toContain('height="180"');
		expect(result).toContain('<path');
	});

	it('does not duplicate dimensions that already exist', () => {
		const result = extractSvgText('<svg width="100" height="50" viewBox="0 0 320 180" />');
		expect(result.match(/width=/g)).toHaveLength(1);
		expect(result.match(/height=/g)).toHaveLength(1);
	});

	it('keeps an existing namespace untouched', () => {
		const result = extractSvgText(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" />',
		);
		expect(result.match(/xmlns=/g)).toHaveLength(1);
	});

	it('returns markup unchanged when it is not an SVG', () => {
		expect(extractSvgText('<div>nope</div>')).toBe('<div>nope</div>');
	});
});
