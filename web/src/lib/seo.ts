import { site } from './site.js';

/** Absolute URL for a root-relative path, without a trailing slash. */
export function absoluteUrl(path: string): string {
	const clean = path === '/' ? '' : path.replace(/\/+$/, '');
	return `${site.url}${clean}`;
}

/**
 * JSON for a `<script type="application/ld+json">` block.
 *
 * `<` is escaped so a title containing `</script>` cannot close the tag and
 * inject markup. JSON parsers read `\u003c` as `<`, so the data is unchanged.
 */
export function jsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Ready-to-inject `<script type="application/ld+json">` tags. */
export function jsonLdTags(schemas: readonly unknown[]): string {
	return schemas
		.map((schema) => `<script type="application/ld+json">${jsonLd(schema)}</script>`)
		.join('');
}

/** `SoftwareApplication` schema — what this app is, what it costs, where it runs. */
export function softwareApplicationSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: site.name,
		description: site.description,
		url: site.url,
		applicationCategory: 'ProductivityApplication',
		applicationSubCategory: 'Note-taking',
		operatingSystem: 'Windows, macOS, Linux',
		downloadUrl: `${site.url}/download`,
		license: 'https://www.gnu.org/licenses/agpl-3.0.html',
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		featureList: [
			'Markdown notes with live preview',
			'Tasks with dependencies, board and Gantt views',
			'A graph of wiki links between notes',
			'Works fully offline in a local SQLite database',
			'Built-in MCP server for AI assistants'
		],
		sameAs: [site.repo]
	};
}

export type FaqItem = { question: string; answer: string };

/** `FAQPage` schema. Keep it in sync with the questions rendered on the page. */
export function faqSchema(items: readonly FaqItem[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer }
		}))
	};
}
