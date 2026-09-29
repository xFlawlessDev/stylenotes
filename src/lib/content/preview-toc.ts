/** Pure helpers behind the preview table of contents. No DOM, no Svelte. */

/**
 * Attribute the markdown pipeline puts on headings it rendered from the note
 * body. Prerendered Mermaid diagrams never carry it, which is how the outline
 * tells real headings apart from diagram labels.
 */
export const TOC_DIGEST_ATTR = 'data-toc-digest';

export type TocEntry = {
	/** Heading level, 1–6. */
	level: number;
	/** Heading text, marks and wiki syntax removed. */
	text: string;
	/** Id of the heading in the preview, from `slugifyHeading`. */
	slug: string;
};

/** A heading's offset from the top of the scroll container, in pixels. */
export type TocOffset = { slug: string; top: number };

/**
 * Removes the syntax that would otherwise leak into a label: images, wiki
 * links (with their `|label` / `#heading` parts), links and inline marks.
 */
export function cleanHeadingText(text: string): string {
	return text
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(
			/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
			(_, target: string, label?: string) => (label ?? target).trim(),
		)
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[`*_~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Splits rendered HTML into its heading outlines. `open` tags end with `>`, so
 * a fenced code block that merely mentions `<h2>` cannot register as one.
 */
export function parseHeadings(html: string, digest = false): TocEntry[] {
	const entries: TocEntry[] = [];
	const tag = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
	for (const match of html.matchAll(tag)) {
		const attrs = match[2];
		if (digest && !attrs.includes(TOC_DIGEST_ATTR)) continue;
		const slug = /\bid="([^"]*)"/i.exec(attrs)?.[1];
		if (!slug) continue;
		entries.push({ level: Number(match[1]), text: cleanHeadingText(match[3]) || slug, slug });
	}
	return entries;
}

export function tocFromHtml(html: string): TocEntry[] {
	return parseHeadings(html, true);
}

/**
 * Index of the heading the reader is currently under: the last one whose top
 * has passed the reading line, or `-1` before the first heading.
 */
export function activeTocIndex(offsets: TocOffset[], top: number): number {
	for (let index = offsets.length - 1; index >= 0; index -= 1) {
		if (offsets[index].top <= top) return index;
	}
	return -1;
}

/**
 * Staircases the outline indentation so a document that starts at `##` does not
 * look over-indented, while keeping the real nesting depth.
 */
export function tocIndent(levels: number[]): number[] {
	const sorted = Array.from(new Set(levels)).sort((a, b) => a - b);
	return levels.map((level) => Math.max(0, sorted.indexOf(level)));
}
