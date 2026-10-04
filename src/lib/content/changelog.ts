/// <reference types="vite/client" />
import changelogRaw from '../../../CHANGELOG.md?raw';
import type { ChangelogEntry, ChangelogSection } from '$lib/content/update-types';

/**
 * Parses the bundled `CHANGELOG.md` (the same file `bun run release` appends to)
 * into per-version entries the About dialog can render.
 *
 * `import ... ?raw` bakes the file into the build, so the dialog shows real
 * release history with no network call. The parser is pure and tested
 * (`changelog.test.ts`); it accepts the two heading shapes the tooling writes:
 *
 *     ## 0.1.0 (2026-10-02)
 *     ## [1.2.3](https://…/compare/…) (2026-04-02)
 *
 * and the `## [Unreleased]` block. Unknown lines are ignored rather than
 * surfaced, so a hand-edited file cannot break the dialog.
 */

const VERSION_RE = /(\d+\.\d+\.\d+(?:-[\w.]+)?)/;
const DATE_RE = /\((\d{4}-\d{2}-\d{2})\)/;

/** Turns one changelog bullet into readable plain text (links kept as labels). */
export function cleanItem(markdown: string): string {
	return markdown
		// Drop the commit/issue link groups the release tool appends: `([abc123](url))`.
		.replace(/\s*\(\[[^\]]+\]\([^)]+\)\)/g, '')
		// Keep a link's label, discard its target.
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[`*]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Parses a `CHANGELOG.md` body into entries, in file order (newest first). */
export function parseChangelog(raw: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = [];
	let entry: ChangelogEntry | null = null;
	let section: ChangelogSection | null = null;
	let appendTo: number[] | null = null;

	for (const line of raw.split(/\r?\n/)) {
		const versionMatch = /^##\s+(.+)$/.exec(line);
		if (versionMatch) {
			const heading = versionMatch[1];
			const version = VERSION_RE.exec(heading)?.[1] ?? 'Unreleased';
			entry = {
				version,
				date: DATE_RE.exec(heading)?.[1] ?? '',
				sections: [],
				unreleased: version === 'Unreleased',
			};
			entries.push(entry);
			section = null;
			appendTo = null;
			continue;
		}
		if (!entry) continue;

		const sectionMatch = /^###\s+(.+)$/.exec(line);
		if (sectionMatch) {
			section = { title: sectionMatch[1].trim(), items: [] };
			entry.sections.push(section);
			appendTo = null;
			continue;
		}

		const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
		if (bullet && section) {
			section.items.push(cleanItem(bullet[1]));
			appendTo = [entry.sections.indexOf(section), section.items.length - 1];
			continue;
		}

		// A wrapped continuation line belongs to the bullet above it.
		if (appendTo && line.trim() && !line.startsWith('#')) {
			const [sectionIndex, itemIndex] = appendTo;
			const target = entry.sections[sectionIndex];
			if (target) target.items[itemIndex] = cleanItem(`${target.items[itemIndex]} ${line.trim()}`);
			continue;
		}

		appendTo = null;
	}

	return entries;
}

/** The changelog, newest first, as imported from the repository. */
export const changelog: ChangelogEntry[] = parseChangelog(changelogRaw);

/** The released (non-`Unreleased`) entries, which is what the dialog shows. */
export const releasedChangelog: ChangelogEntry[] = changelog.filter((entry) => !entry.unreleased);
