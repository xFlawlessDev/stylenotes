import { describe, expect, it } from 'vitest';
import { absoluteUrl, faqSchema, jsonLd, softwareApplicationSchema } from './seo.js';
import { site } from './site.js';

describe('absoluteUrl', () => {
	it('drops the trailing slash from the root', () => {
		expect(absoluteUrl('/')).toBe(site.url);
	});

	it('keeps a plain path', () => {
		expect(absoluteUrl('/download')).toBe(`${site.url}/download`);
	});

	it('trims a trailing slash so one page has one canonical URL', () => {
		expect(absoluteUrl('/download/')).toBe(`${site.url}/download`);
	});
});

describe('jsonLd', () => {
	it('escapes `<` so a value cannot close the script tag', () => {
		const serialized = jsonLd({ name: '</script><script>alert(1)</script>' });
		expect(serialized).not.toContain('</script>');
		expect(serialized).toContain('\\u003c');
	});

	it('still round-trips through JSON.parse', () => {
		const data = { name: 'a < b', n: 1 };
		expect(JSON.parse(jsonLd(data))).toEqual(data);
	});
});

describe('schemas', () => {
	it('describes a free desktop application', () => {
		const schema = softwareApplicationSchema();
		expect(schema['@type']).toBe('SoftwareApplication');
		expect(schema.offers.price).toBe('0');
		expect(schema.operatingSystem).toContain('Windows');
	});

	it('builds one Question per FAQ item', () => {
		const schema = faqSchema([{ question: 'Q?', answer: 'A.' }]);
		expect(schema.mainEntity).toHaveLength(1);
		expect(schema.mainEntity[0].acceptedAnswer.text).toBe('A.');
	});
});
