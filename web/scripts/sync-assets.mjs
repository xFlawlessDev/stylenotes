#!/usr/bin/env node
/**
 * Copies the shared brand assets out of `docs/assets` (and the app's
 * favicon) into `web/static`, so screenshots and the logo have exactly one
 * tracked copy in the repository. The copies are gitignored and rebuilt by
 * `prepare`/`prebuild`, which also keeps CI and Cloudflare builds honest.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const repo = join(web, '..');
const staticDir = join(web, 'static');

/** @param {string} from @param {string} to */
async function copy(from, to) {
	try {
		await stat(from);
	} catch {
		console.warn(`[sync-assets] missing ${from} — skipped`);
		return;
	}
	await mkdir(dirname(to), { recursive: true });
	await cp(from, to);
}

const screenshots = [
	'notes.webp',
	'note-markdown.webp',
	'kanban.webp',
	'gantt.webp',
	'graph.webp',
	'journal.webp',
	'command-palette.webp',
	'overlay-and-underlay.webp',
	'quick-windows.webp'
];

await copy(join(repo, 'docs', 'assets', 'logo.png'), join(staticDir, 'logo.png'));
await copy(join(repo, 'static', 'favicon.png'), join(staticDir, 'favicon.png'));

for (const file of screenshots) {
	await copy(join(repo, 'docs', 'assets', 'screenshots', file), join(staticDir, 'screenshots', file));
}

console.log(`[sync-assets] ${screenshots.length} screenshots + logo ready in web/static`);
