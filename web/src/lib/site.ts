/**
 * Site-wide constants.
 *
 * `url` comes from `__SITE_URL__`, injected at build time from
 * `PUBLIC_SITE_URL` (see `vite.config.ts`). Everything canonical, social, and
 * sitemap-related derives from it, so pointing the site at a different domain
 * is one build variable, not an edit in five files.
 */
export const site = {
	name: 'StyleNotes',
	url: __SITE_URL__,
	title: 'StyleNotes — calm, private Markdown notes and tasks',
	description:
		'A fast, offline-first desktop notebook. Markdown notes, tasks with dependencies, and a graph that connects them — stored in a local SQLite database. No account, no cloud required.',
	repo: 'https://github.com/xFlawlessDev/stylenotes',
	releases: 'https://github.com/xFlawlessDev/stylenotes/releases',
	latestRelease: 'https://github.com/xFlawlessDev/stylenotes/releases/latest',
	license: 'AGPL-3.0-only',
	author: 'xFlawlessDev',
	keywords: [
		'markdown notes',
		'note taking app',
		'local-first',
		'offline notes',
		'task manager',
		'knowledge graph',
		'MCP',
		'Tauri',
		'privacy'
	]
} as const;

export type PlatformId = 'windows' | 'macos' | 'linux';

export const platforms: ReadonlyArray<{
	id: PlatformId;
	label: string;
	detail: string;
	/** File suffixes that identify this platform's installer in a release. */
	suffixes: readonly string[];
}> = [
	{
		id: 'windows',
		label: 'Windows',
		detail: 'x64 · .msi or .exe',
		suffixes: ['.msi', '-setup.exe', '.exe']
	},
	{
		id: 'macos',
		label: 'macOS',
		detail: 'Apple silicon · .dmg',
		suffixes: ['.dmg']
	},
	{
		id: 'linux',
		label: 'Linux',
		detail: 'x64 · .AppImage',
		suffixes: ['.AppImage']
	}
];

/** Routes that belong in the sitemap, with their crawl hints. */
export const sitemapRoutes = [
	{ path: '/', priority: 1.0, changefreq: 'weekly' },
	{ path: '/download', priority: 0.8, changefreq: 'weekly' }
] as const;
